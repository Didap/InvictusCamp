import { Resend } from 'resend'
import {
  claimEmailSlots,
  claimQueuedEmails,
  recordEmailOutcomes,
  recoverInterruptedEmails,
  type EmailOutcome,
  type EmailToSend,
} from '../domain/email-quota'
import type { EmailContext, EmailMessage } from '../emails/types'

let resend: Resend | null = null

/** What templates need from the configuration. */
export function emailContext(): EmailContext {
  return { appUrl: useRuntimeConfig().appUrl }
}

export interface DeliveryReport {
  sent: number
  failed: number
  simulated: number
  queued: number
}

/**
 * Hands the emails to Resend in batches of 100. Without an API key they are "simulated" and, in
 * development, their devNote (the link or code of an access email) is printed in the console.
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
      )
      if (error) {
        console.error(`[email] invio rifiutato (${chunk.length} messaggi): ${error.message}`)
        for (const item of chunk) {
          outcomes.push({ id: item.id, status: 'failed', error: error.message.slice(0, 500) })
        }
        continue
      }
      chunk.forEach((item, index) =>
        outcomes.push({ id: item.id, status: 'sent', providerId: data?.data?.[index]?.id }),
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`[email] invio non riuscito (${chunk.length} messaggi): ${reason}`)
      for (const item of chunk) {
        outcomes.push({ id: item.id, status: 'failed', error: reason.slice(0, 500), uncertain: true })
      }
    }
  }
  return outcomes
}

async function record(outcomes: EmailOutcome[]) {
  try {
    await recordEmailOutcomes(useDb(), outcomes)
  } catch (error) {
    console.error('[email] registro non aggiornato:', error instanceof Error ? error.message : error)
  }
}

/**
 * Sends the messages within the daily limit (domain/email-quota) and records every one in email_log:
 * what does not fit waits in the queue, an access email over the limit is recorded as failed. Never
 * throws. Call it after the transaction that produced the messages has committed.
 */
export async function deliver(input: EmailMessage | EmailMessage[]): Promise<DeliveryReport> {
  const messages = Array.isArray(input) ? input : [input]
  const report: DeliveryReport = { sent: 0, failed: 0, simulated: 0, queued: 0 }
  if (!messages.length) return report

  let claim: Awaited<ReturnType<typeof claimEmailSlots>>
  try {
    claim = await claimEmailSlots(useDb(), messages)
  } catch (error) {
    // Without the count the limit cannot be guaranteed, so nothing leaves.
    console.error('[email] limite non verificabile, invio annullato:', error instanceof Error ? error.message : error)
    report.failed = messages.length
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
  await recoverInterruptedEmails(db, now)
  const items = await claimQueuedEmails(db, now)
  if (!items.length) return 0
  await record(await dispatch(items))
  return items.length
}
