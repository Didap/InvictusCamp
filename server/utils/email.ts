import { Resend } from 'resend'
import type { DeliveryReport } from '#shared/types/communications'
import {
  claimEmailSlots,
  claimQueuedEmails,
  hasQueueWork,
  providerRefusal,
  recordDisabled,
  recordEmailOutcomes,
  recordUndelivered,
  recoverInterruptedEmails,
  type EmailOutcome,
  type EmailToSend,
} from '../domain/email-quota'
import { loadEmailSettings } from '../domain/automatic-emails'
import type { DbOrTx } from '../domain/db'
import type { EmailContext, EmailMessage } from '../emails/types'

/** After a provider problem the queue waits this long, so an outage does not burn through it. */
const QUEUE_PAUSE_MS = 10 * 60 * 1000

let resend: Resend | null = null
let queuePausedUntil = 0

/**
 * What templates need: the app's address, and the texts and switches of Comunicazioni › Automatiche read
 * through `db` (the open transaction, when there is one). Never throws: when they cannot be read the emails
 * leave with their starting texts, as an access email must.
 */
export async function emailContext(db: DbOrTx = useDb()): Promise<EmailContext> {
  const appUrl = useRuntimeConfig().appUrl
  try {
    return { appUrl, ...(await loadEmailSettings(db)) }
  } catch (error) {
    logEmailError('email automatiche non lette, testi iniziali', error)
    return { appUrl }
  }
}

export function logEmailError(label: string, error: unknown) {
  console.error(`[email] ${label}:`, error instanceof Error ? error.message : error)
}

/**
 * Hands the emails to Resend in batches of 100, each address judged on its own (`permissive`), so one
 * bad address does not stop the others. Without an API key they are "simulated" and, in development,
 * their devNote (the link or code of an access email) is printed in the console.
 */
async function dispatch(items: EmailToSend[]): Promise<EmailOutcome[]> {
  const config = useRuntimeConfig()
  if (!config.resendApiKey) {
    return items.map(item => {
      if (import.meta.dev) {
        console.info(
          `[email simulata] ${item.template} → ${item.to}: ${item.subject}${item.devNote ? `\n  ${item.devNote}` : ''}`,
        )
      }
      return { id: item.id, status: 'simulated' as const }
    })
  }
  resend ??= new Resend(config.resendApiKey)
  const outcomes: EmailOutcome[] = []
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100)
    try {
      const { data, error } = await resend.batch.send(
        chunk.map(item => ({
          from: config.emailFrom,
          to: [item.to],
          subject: item.subject,
          html: item.html,
          text: item.text,
          ...(config.emailReplyTo ? { replyTo: config.emailReplyTo } : {}),
        })),
        { batchValidation: 'permissive' },
      )
      if (error) {
        console.error(`[email] invio rifiutato (${chunk.length} messaggi): ${error.message}`)
        for (const item of chunk) outcomes.push(providerRefusal(item, error))
        continue
      }
      // The ids come back only for the accepted emails, in order.
      const rejected = new Map((data?.errors ?? []).map(({ index, message }) => [index, message]))
      const ids = data?.data ?? []
      let accepted = 0
      chunk.forEach((item, index) => {
        const reason = rejected.get(index)
        if (reason) outcomes.push({ id: item.id, status: 'failed', error: reason })
        else outcomes.push({ id: item.id, status: 'sent', providerId: ids[accepted++]?.id })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[email] invio non riuscito (${chunk.length} messaggi): ${message}`)
      for (const item of chunk) outcomes.push(providerRefusal(item, { message, statusCode: null }))
    }
  }
  return outcomes
}

async function record(outcomes: EmailOutcome[]) {
  try {
    await recordEmailOutcomes(useDb(), outcomes)
  } catch (error) {
    logEmailError('registro non aggiornato', error)
  }
}

/**
 * Sends the messages within the daily limit (domain/email-quota) and records every one in email_log:
 * what does not fit waits in the queue, an access email over the limit is recorded as failed, an email
 * switched off in Comunicazioni › Automatiche is recorded as disabled. Never throws. Call it after the
 * transaction that produced the messages has committed.
 */
export async function deliver(input: EmailMessage | EmailMessage[]): Promise<DeliveryReport> {
  const all = Array.isArray(input) ? input : [input]
  const off = all.filter(message => message.switchedOff)
  const messages = all.filter(message => !message.switchedOff)
  const report: DeliveryReport = { sent: 0, failed: 0, simulated: 0, queued: 0, disabled: off.length }
  if (off.length) await recordDisabled(useDb(), off).catch(error => logEmailError('registro non aggiornato', error))
  if (!messages.length) return report

  let claim: Awaited<ReturnType<typeof claimEmailSlots>>
  try {
    claim = await claimEmailSlots(useDb(), messages)
  } catch (error) {
    // Without the count the limit cannot be guaranteed, so nothing leaves.
    logEmailError('limite non verificabile, invio annullato', error)
    report.failed = messages.length
    await recordUndelivered(useDb(), messages, 'Limite giornaliero non verificabile: email non inviata.').catch(
      failure => logEmailError('registro non aggiornato', failure),
    )
    return report
  }
  report.queued = claim.queued
  report.failed = claim.refused
  const outcomes = await dispatch(claim.toSend)
  for (const outcome of outcomes) report[outcome.status]++
  await record(outcomes)
  return report
}

/** One round of the queue: closes interrupted sends, then sends what fits now. Returns how many left. */
export async function drainEmailQueue(now: Date = new Date()): Promise<number> {
  const db = useDb()
  if (!(await hasQueueWork(db))) return 0
  await recoverInterruptedEmails(db, now)
  if (now.getTime() < queuePausedUntil) return 0
  const items = await claimQueuedEmails(db, now)
  if (!items.length) return 0
  const outcomes = await dispatch(items)
  await record(outcomes)
  if (outcomes.some(outcome => outcome.status === 'queued' || outcome.uncertain)) {
    queuePausedUntil = now.getTime() + QUEUE_PAUSE_MS
  }
  return outcomes.filter(outcome => outcome.status === 'sent' || outcome.status === 'simulated').length
}
