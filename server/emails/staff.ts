// Emails of the staff area: the outcome of a review (written or kept by the administration and sent
// only from "Comunica l’esito"), a convocation to a session and its cancellation, the availability
// reopened. No health details, no access links: they are kept in email_log. Their texts live in
// shared/utils/automatic-emails.ts.
import type { StaffOutcomeTemplate } from '../../shared/types/staff'
import { fillEmailFields } from '../../shared/utils/automatic-emails'
import { formatDayRange } from '../../shared/utils/format'
import { automaticEmail, emailTexts } from './automatic'
import { appLink } from './layout'
import type { EmailContext, EmailMessage } from './types'

interface Recipient {
  to: string
  toUserId: string
  firstName: string
}

interface ConvocationSession {
  id: string
  title: string
  startDate: string
  endDate: string
  location: string
}

/** The subject and the text proposed to the administration before sending the outcome to this person. */
export function outcomeProposal(
  ctx: EmailContext,
  template: StaffOutcomeTemplate,
  firstName: string,
): { subject: string; message: string } {
  const texts = emailTexts(ctx, template)
  const fill = (text: string) => fillEmailFields(template, text, { nome: firstName })
  return { subject: fill(texts.subject), message: fill(texts.body) }
}

/** "Esito della candidatura": the message the administration kept or wrote, sent when it chose to. */
export function staffOutcomeEmail(
  ctx: EmailContext,
  input: Recipient & { template: StaffOutcomeTemplate; message: string },
): EmailMessage {
  return automaticEmail(ctx, input.template, {
    to: input.to,
    toUserId: input.toUserId,
    values: { nome: input.firstName },
    body: input.message,
    actionUrl: input.template === 'staff.approved' ? appLink(ctx, '/staff') : undefined,
  })
}

function sessionEmail(
  ctx: EmailContext,
  key: 'staff.convocation' | 'staff.convocation_cancelled' | 'staff.session_cancelled',
  input: Recipient & { session: ConvocationSession; roleName: string | null; message?: string | null },
  path: string,
): EmailMessage {
  const { session } = input
  const dates = formatDayRange(session.startDate, session.endDate, 'long')
  const details = [
    { label: 'Sessione', value: session.title },
    { label: 'Date', value: dates },
    { label: 'Luogo', value: session.location },
  ]
  if (input.roleName) details.push({ label: 'Ruolo', value: input.roleName })
  return automaticEmail(ctx, key, {
    to: input.to,
    toUserId: input.toUserId,
    values: { nome: input.firstName, sessione: session.title, date: dates, luogo: session.location },
    details,
    actionUrl: appLink(ctx, path),
    extra: input.message,
    sessionId: session.id,
  })
}

/** `staff.convocation`: sent by "Invia la convocazione", with the message written then. */
export function convocationEmail(
  ctx: EmailContext,
  input: Recipient & { session: ConvocationSession; roleName: string | null; message?: string | null },
): EmailMessage {
  return sessionEmail(ctx, 'staff.convocation', input, '/staff/convocazioni')
}

/**
 * `staff.convocation_cancelled`: a convocation that had been sent is withdrawn; `staff.session_cancelled`
 * when it is because the whole session was cancelled (`sessionCancelled`).
 */
export function convocationCancelledEmail(
  ctx: EmailContext,
  input: Recipient & { session: ConvocationSession; roleName: string | null; sessionCancelled?: boolean },
): EmailMessage {
  const key = input.sessionCancelled ? 'staff.session_cancelled' : 'staff.convocation_cancelled'
  return sessionEmail(ctx, key, input, '/staff/sessioni')
}

/** The administration reopened the availability (after «Chiedi il reset», or on its own). */
export function availabilityReopenedEmail(ctx: EmailContext, input: Recipient): EmailMessage {
  return automaticEmail(ctx, 'staff.availability_reopened', {
    to: input.to,
    toUserId: input.toUserId,
    values: { nome: input.firstName },
    actionUrl: appLink(ctx, '/staff/disponibilita'),
  })
}
