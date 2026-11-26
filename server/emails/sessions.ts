// Emails of the sessions area (docs/spec.md, 4): the invitation of a titolare, the notice to a reserve,
// a place offered to a reserve, the session confirmed or cancelled, a family removed, the end-of-session
// questionnaire. They speak to the family's account ("tu"), carry the session's facts and never any health
// detail. Their texts live in shared/utils/automatic-emails.ts.
import type { AutomaticEmailKey } from '../../shared/utils/automatic-emails'
import { formatDay, formatDayRange } from '../../shared/utils/format'
import { automaticEmail } from './automatic'
import { appLink } from './layout'
import type { EmailContext, EmailMessage } from './types'

/** The facts of a session an email shows. */
export interface SessionEmailFacts {
  id: string
  title: string
  location: string
  startDate: string
  endDate: string
  responseDeadline: string | null
}

/** The family's account. */
export interface FamilyRecipient {
  to: string
  toUserId: string
  firstName: string
}

/** What the session area sends; the domain picks one, the builder picks the variant (reminder, reserve). */
export type SessionEmailTemplate =
  | 'session.invite'
  | 'session.reserve'
  | 'session.slot_offered'
  | 'session.confirmed'
  | 'session.cancelled'
  | 'session.removed'
  | 'session.feedback'

/** Every email key of the area, variants included (session.invite_reminder, session.reserve_removed). */
export type SessionEmailKey = Extract<AutomaticEmailKey, `session.${string}`>

const FAMILY_SESSIONS_PATH = '/famiglia/sessioni'

/** The rows of a session's facts an email shows; the deadline only where an answer is expected. */
export function sessionFacts(
  session: Omit<SessionEmailFacts, 'id' | 'responseDeadline'> & { responseDeadline?: string | null },
  options: { deadline?: boolean } = {},
) {
  const rows = [
    { label: 'Sessione', value: session.title },
    { label: 'Date', value: formatDayRange(session.startDate, session.endDate, 'long') },
    { label: 'Luogo', value: session.location },
  ]
  if (options.deadline && session.responseDeadline) {
    rows.push({ label: 'Rispondi entro', value: formatDay(session.responseDeadline, 'long') })
  }
  return rows
}

/**
 * One email of the area: greeting, the session's facts, the button to the family's sessions (to the
 * questionnaire for session.feedback).
 */
export function familySessionEmail(
  ctx: EmailContext,
  key: SessionEmailKey,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  const answers = key === 'session.invite' || key === 'session.invite_reminder' || key === 'session.slot_offered'
  return automaticEmail(ctx, key, {
    to: recipient.to,
    toUserId: recipient.toUserId,
    values: {
      nome: recipient.firstName,
      sessione: session.title,
      date: formatDayRange(session.startDate, session.endDate, 'long'),
      luogo: session.location,
    },
    details: sessionFacts(session, { deadline: answers }),
    actionUrl: appLink(ctx, key === 'session.feedback' ? `/famiglia/questionario/${session.id}` : FAMILY_SESSIONS_PATH),
    sessionId: session.id,
  })
}
