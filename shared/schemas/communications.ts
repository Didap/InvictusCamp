// Communications (docs/spec.md, 3.7): the audience of a message, the message itself, the filters of
// the email log. The same schemas feed the composer's UForm and the API.
import { z } from 'zod'
import type { Audience, AudienceType } from '../types/domain'
import {
  CONVOCATION_STATUSES,
  EMAIL_STATUSES,
  enumLabel,
  PARTICIPATION_KINDS,
  PARTICIPATION_STATUSES,
  STAFF_TEAMS,
  type ConvocationStatus,
  type ParticipationKind,
  type ParticipationStatus,
  type StaffTeam,
} from '../utils/constants'
import { AUTOMATIC_EMAIL_KEYS, AUTOMATIC_EMAILS } from '../utils/automatic-emails'
import { orList, plural } from '../utils/format'
import { fieldIssue, messageIssue } from '../utils/message-fields'
import { zListQuery, zOptional, zRequiredText, zText } from './common'

export const AUDIENCE_TYPES = [
  'all_families',
  'all_staff',
  'staff_candidates',
  'session_families',
  'session_staff',
  'users',
] as const satisfies readonly AudienceType[]

/** The choices of the composer, in the order they are shown. */
export const AUDIENCE_TYPE_META: Record<AudienceType, { label: string; description: string; icon: string }> = {
  all_families: {
    label: 'Tutte le famiglie',
    description: 'Ogni famiglia con l’account attivo',
    icon: 'i-lucide-heart-handshake',
  },
  all_staff: { label: 'Tutto lo staff approvato', description: 'Chi può essere convocato', icon: 'i-lucide-id-card' },
  staff_candidates: {
    label: 'Candidature da valutare',
    description: 'Chi ha inviato la candidatura e aspetta l’esito',
    icon: 'i-lucide-inbox',
  },
  session_families: {
    label: 'Le famiglie di una sessione',
    description: 'Titolari e riserve, per stato',
    icon: 'i-lucide-calendar-heart',
  },
  session_staff: {
    label: 'Staff o v-team di una sessione',
    description: 'Per squadra e stato della convocazione',
    icon: 'i-lucide-calendar-check',
  },
  users: { label: 'Persone scelte', description: 'Cerca per nome o email', icon: 'i-lucide-user-search' },
}

/** Families of a session written to unless the administration chooses otherwise: those who know about it. */
export const DEFAULT_FAMILY_STATUSES: ParticipationStatus[] = ['invited', 'confirmed']
/** Staff of a session written to by default: convocation sent or accepted. */
export const DEFAULT_STAFF_STATUSES: ConvocationStatus[] = ['sent', 'accepted']

const zSessionId = z.uuid({ error: 'Scegli una sessione' })

export const zAudience = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all_families') }),
  z.object({ type: z.literal('all_staff') }),
  z.object({ type: z.literal('staff_candidates') }),
  z.object({
    type: z.literal('session_families'),
    sessionId: zSessionId,
    kinds: z.array(z.enum(PARTICIPATION_KINDS)).max(PARTICIPATION_KINDS.length).optional(),
    statuses: z.array(z.enum(PARTICIPATION_STATUSES)).max(PARTICIPATION_STATUSES.length).optional(),
  }),
  z.object({
    type: z.literal('session_staff'),
    sessionId: zSessionId,
    teams: z.array(z.enum(STAFF_TEAMS)).max(STAFF_TEAMS.length).optional(),
    statuses: z.array(z.enum(CONVOCATION_STATUSES)).max(CONVOCATION_STATUSES.length).optional(),
  }),
  z.object({
    type: z.literal('users'),
    userIds: z
      .array(z.uuid())
      .min(1, { error: 'Scegli almeno una persona' })
      .max(1000, { error: 'Al massimo 1000 persone' }),
  }),
]) satisfies z.ZodType<Audience>

export const audienceRequestSchema = z.object({ audience: zAudience })

const communicationFields = z.object({
  subject: zRequiredText(200),
  body: zRequiredText(20_000),
  audience: zAudience,
})

/** Adds the issue `check` finds in the subject and in the body, each under its own field. */
function checkTexts(check: (text: string) => string | null) {
  return (message: { subject: string; body: string }, ctx: z.RefinementCtx) => {
    for (const key of ['subject', 'body'] as const) {
      const issue = check(message[key])
      if (issue) ctx.addIssue({ code: 'custom', path: [key], message: issue })
    }
  }
}

/**
 * A message sent now. Plain text body: blank lines separate paragraphs. The fields in braces must be
 * ones filled by themselves, and the parts in square brackets of a template must be completed.
 */
export const communicationSchema = communicationFields.superRefine((message, ctx) => {
  // A session audience whose session is still to choose counts as one: its own error says what is missing.
  const hasSession = audienceSessionId(message.audience) !== null
  checkTexts(text => messageIssue(text, hasSession))(message, ctx)
})
export type CommunicationInput = z.infer<typeof communicationSchema>

/** A draft can be saved before the body is written, and with the template's parts still to complete. */
export const communicationDraftSchema = communicationFields.extend({ body: zText(20_000) })
export type CommunicationDraftInput = z.infer<typeof communicationDraftSchema>

export const emailPreviewSchema = z.object({ subject: zText(200), body: zText(20_000) })

/** A saved message to start from. Its parts in square brackets are completed in each message. */
export const messageTemplateSchema = z
  .object({ name: zRequiredText(80), subject: zRequiredText(200), body: zRequiredText(20_000) })
  .superRefine(checkTexts(text => fieldIssue(text)))
export type MessageTemplateInput = z.infer<typeof messageTemplateSchema>

/** Empty query values ("?status=") read as missing. */
export const communicationListQuery = zListQuery.extend({
  sessionId: zOptional(z.uuid()),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const emailLogQuery = zListQuery.extend({
  template: zOptional(z.string().trim().max(60)),
  status: zOptional(z.enum(EMAIL_STATUSES)),
  sessionId: zOptional(z.uuid()),
  communicationId: zOptional(z.uuid()),
  /** Only the last N days. */
  days: zOptional(z.coerce.number().int().min(1).max(366)),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
export type EmailLogQuery = z.infer<typeof emailLogQuery>

/** What each template is, in the log: the automatic emails, then the keys that only older rows carry. */
export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  ...Object.fromEntries(AUTOMATIC_EMAIL_KEYS.map(key => [key, AUTOMATIC_EMAILS[key].label])),
  communication: 'Comunicazione',
  // Before the invitation had one text per role.
  'auth.invite': 'Invito all’accesso',
}

export function emailTemplateLabel(template: string): string {
  return EMAIL_TEMPLATE_LABELS[template] ?? template
}

// ─── The composer's state ──────────────────────────────────────────────────────────────────────────

/** Every control of the audience picker, whatever the chosen type. */
export interface AudienceDraft {
  type: AudienceType
  sessionId?: string
  kinds: ParticipationKind[]
  familyStatuses: ParticipationStatus[]
  staffTeams: StaffTeam[]
  staffStatuses: ConvocationStatus[]
  userIds: string[]
}

export function emptyAudienceDraft(type: AudienceType = 'all_families'): AudienceDraft {
  return {
    type,
    kinds: [...PARTICIPATION_KINDS],
    familyStatuses: [...DEFAULT_FAMILY_STATUSES],
    staffTeams: [...STAFF_TEAMS],
    staffStatuses: [...DEFAULT_STAFF_STATUSES],
    userIds: [],
  }
}

/** The audience the picker describes; a session type without a session keeps an empty id (invalid). */
export function audienceFromDraft(draft: AudienceDraft): Audience {
  switch (draft.type) {
    case 'session_families':
      return {
        type: draft.type,
        sessionId: draft.sessionId ?? '',
        kinds: [...draft.kinds],
        statuses: [...draft.familyStatuses],
      }
    case 'session_staff':
      return {
        type: draft.type,
        sessionId: draft.sessionId ?? '',
        teams: [...draft.staffTeams],
        statuses: [...draft.staffStatuses],
      }
    case 'users':
      return { type: draft.type, userIds: [...draft.userIds] }
    default:
      return { type: draft.type }
  }
}

export function draftFromAudience(audience: Audience): AudienceDraft {
  const draft = emptyAudienceDraft(audience.type)
  if (audience.type === 'session_families') {
    draft.sessionId = audience.sessionId
    if (audience.kinds) draft.kinds = [...audience.kinds]
    if (audience.statuses) draft.familyStatuses = [...audience.statuses]
  } else if (audience.type === 'session_staff') {
    draft.sessionId = audience.sessionId
    if (audience.teams) draft.staffTeams = [...audience.teams]
    if (audience.statuses) draft.staffStatuses = [...audience.statuses]
  } else if (audience.type === 'users') {
    draft.userIds = [...audience.userIds]
  }
  return draft
}

/** The session an audience belongs to, if any. */
export function audienceSessionId(audience: Audience): string | null {
  return audience.type === 'session_families' || audience.type === 'session_staff' ? audience.sessionId : null
}

/** "a, b o c". */
/** One line that says who receives a message: "Famiglie di «Sessione 1» (titolari e riserve; invitata o confermata)". */
export function describeAudience(audience: Audience, sessionTitle?: string | null): string {
  const session = sessionTitle ? `«${sessionTitle}»` : 'una sessione'
  switch (audience.type) {
    case 'all_families':
    case 'all_staff':
    case 'staff_candidates':
      return AUDIENCE_TYPE_META[audience.type].label
    case 'session_families': {
      const parts: string[] = []
      const kinds = audience.kinds ?? [...PARTICIPATION_KINDS]
      if (kinds.length === 1) parts.push(kinds[0] === 'slot' ? 'solo titolari' : 'solo riserve')
      else if (kinds.length === 0) parts.push('nessun tipo scelto')
      else parts.push('titolari e riserve')
      const statuses = audience.statuses ?? [...PARTICIPATION_STATUSES]
      if (statuses.length < PARTICIPATION_STATUSES.length) {
        parts.push(
          statuses.length
            ? `stato: ${orList(statuses.map(s => enumLabel('participationStatus', s).toLowerCase()))}`
            : 'nessuno stato scelto',
        )
      }
      return `Famiglie di ${session} (${parts.join('; ')})`
    }
    case 'session_staff': {
      const teams = [...new Set(audience.teams ?? STAFF_TEAMS)]
      const who = teams.length === 1 ? enumLabel('staffTeam', teams[0]!) : 'Staff e v-team'
      if (!teams.length) return `${who} di ${session} (nessuna squadra scelta)`
      const statuses = [...new Set(audience.statuses ?? CONVOCATION_STATUSES)]
      if (statuses.length >= CONVOCATION_STATUSES.length) return `${who} di ${session}`
      return statuses.length
        ? `${who} di ${session} (convocazione: ${orList(statuses.map(s => enumLabel('convocationStatus', s).toLowerCase()))})`
        : `${who} di ${session} (nessuno stato scelto)`
    }
    case 'users':
      return plural(new Set(audience.userIds).size, 'persona scelta', 'persone scelte')
  }
}
