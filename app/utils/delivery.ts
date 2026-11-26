import type { DeliveryReport } from '#shared/types/communications'
import { plural } from '#shared/utils/format'

/** The sentence for the emails held back by a switched-off automatic email, or ''. */
export function emailsOffNote(count: number | undefined): string {
  if (!count) return ''
  return count === 1
    ? '1 email è spenta in Comunicazioni › Automatiche e non parte.'
    : `${count} email sono spente in Comunicazioni › Automatiche e non partono.`
}

/** What happened to the emails of a send, in one or two sentences for the toast. */
export function deliveryOutcome(report: DeliveryReport): string {
  const parts: string[] = []
  if (report.failed) {
    parts.push(`${plural(report.failed, 'email non recapitata', 'email non recapitate')}: le trovi nel registro.`)
  }
  if (report.queued) {
    parts.push(
      `${plural(report.sent + report.simulated, 'email partita', 'email partite')}, ${report.queued} in coda: partono da sole.`,
    )
  }
  if (report.disabled) parts.push(emailsOffNote(report.disabled))
  if (!parts.length) {
    parts.push(
      report.simulated
        ? `${plural(report.simulated, 'email registrata come simulata', 'email registrate come simulate')}: in questo ambiente non partono davvero.`
        : `${plural(report.sent, 'email partita', 'email partite')}.`,
    )
  }
  return parts.join(' ')
}
