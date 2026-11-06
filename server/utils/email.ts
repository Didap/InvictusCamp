import { Resend } from 'resend'
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
}

/**
 * Sends the messages with Resend (batches of 100) and records every one in email_log. Without an API
 * key the messages are recorded as "simulated" and, in development, their devNote (the link or code
 * of an access email) is printed in the console. Never throws: a failed send is recorded as "failed".
 * Call it after the transaction that produced the messages has committed.
 */
export async function deliver(input: EmailMessage | EmailMessage[]): Promise<DeliveryReport> {
  const messages = Array.isArray(input) ? input : [input]
  const report: DeliveryReport = { sent: 0, failed: 0, simulated: 0 }
  if (!messages.length) return report
  const config = useRuntimeConfig()
  const outcomes: {
    message: EmailMessage
    status: 'sent' | 'failed' | 'simulated'
    providerId?: string
    error?: string
  }[] = []

  if (!config.resendApiKey) {
    for (const message of messages) {
      outcomes.push({ message, status: 'simulated' })
      if (import.meta.dev) {
        console.info(
          `[email simulata] ${message.template} → ${message.to}: ${message.subject}${message.devNote ? `\n  ${message.devNote}` : ''}`,
        )
      }
    }
  } else {
    resend ??= new Resend(config.resendApiKey)
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100)
      try {
        const { data, error } = await resend.batch.send(
          chunk.map(message => ({
            from: config.emailFrom,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(config.emailReplyTo ? { replyTo: config.emailReplyTo } : {}),
          })),
        )
        if (error) throw new Error(error.message)
        chunk.forEach((message, index) =>
          outcomes.push({ message, status: 'sent', providerId: data?.data?.[index]?.id }),
        )
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`[email] invio non riuscito (${chunk.length} messaggi): ${reason}`)
        for (const message of chunk) outcomes.push({ message, status: 'failed', error: reason.slice(0, 500) })
      }
    }
  }

  for (const outcome of outcomes) report[outcome.status]++
  try {
    await useDb()
      .insert(tables.emailLog)
      .values(
        outcomes.map(({ message, status, providerId, error }) => ({
          template: message.template,
          toEmail: message.to,
          toUserId: message.toUserId ?? null,
          subject: message.subject,
          html: message.sensitive ? null : message.html,
          status,
          providerId: providerId ?? null,
          error: error ?? null,
          communicationId: message.communicationId ?? null,
          sessionId: message.sessionId ?? null,
        })),
      )
  } catch (error) {
    console.error('[email] registro non aggiornato:', error instanceof Error ? error.message : error)
  }
  return report
}
