// Emails of the sessions area (docs/spec.md, 4): the invitation of a titolare, the notice to a reserve,
// a place offered to a reserve, the session confirmed or cancelled, a family removed, the end-of-session
// questionnaire. They speak to the family's account ("tu"), carry the session's facts and never any health
// detail. Their texts live in shared/utils/automatic-emails.ts.
import type { ParticipationKind } from '../../shared/utils/constants'
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

/** Every email key of the area, variants included. */
export type SessionEmailKey = SessionEmailTemplate | 'session.invite_reminder' | 'session.reserve_removed'

const FAMILY_SESSIONS_PATH = '/famiglia/sessioni'

function facts(session: SessionEmailFacts, options: { deadline?: boolean } = {}) {
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

/** One email of the area: greeting, the session's facts, the button to the family's sessions. */
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
    details: facts(session, { deadline: answers }),
    actionUrl: appLink(ctx, key === 'session.feedback' ? `/famiglia/questionario/${session.id}` : FAMILY_SESSIONS_PATH),
    sessionId: session.id,
  })
}

/** session.invite: a titolare is invited (the session opens, or the family is added while it is open). */
export function sessionInviteEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
  options: { reminder?: boolean } = {},
): EmailMessage {
  return familySessionEmail(ctx, options.reminder ? 'session.invite_reminder' : 'session.invite', recipient, session)
}

/** session.reserve: the family is on the reserve list of the session. */
export function sessionReserveEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  return familySessionEmail(ctx, 'session.reserve', recipient, session)
}

/** session.slot_offered: a reserve is called to a free place. */
export function sessionSlotOfferedEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  return familySessionEmail(ctx, 'session.slot_offered', recipient, session)
}

/** session.confirmed: the session will take place (to the titolari who confirmed). */
export function sessionConfirmedEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  return familySessionEmail(ctx, 'session.confirmed', recipient, session)
}

/** session.cancelled: the session will not take place (to the families invited or confirmed). */
export function sessionCancelledEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  return familySessionEmail(ctx, 'session.cancelled', recipient, session)
}

/** session.removed (session.reserve_removed for a reserve): the administration removed a family that had been told. */
export function sessionRemovedEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
  kind: ParticipationKind,
): EmailMessage {
  return familySessionEmail(ctx, kind === 'reserve' ? 'session.reserve_removed' : 'session.removed', recipient, session)
}

/** session.feedback: the session is over, the families who took part answer the questionnaire. */
export function sessionFeedbackEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  return familySessionEmail(ctx, 'session.feedback', recipient, session)
}
