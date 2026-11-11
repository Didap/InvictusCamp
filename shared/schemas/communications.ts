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
  type ConvocationStatus,
  type ParticipationKind,
  type ParticipationStatus,
} from '../utils/constants'
import { plural } from '../utils/format'
import { messageIssue, unknownFieldIssue } from '../utils/message-fields'
import { zListQuery, zRequiredText, zText } from './common'

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
    label: 'Lo staff di una sessione',
    description: 'Per stato della convocazione',
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

/**
 * A message sent now. Plain text body: blank lines separate paragraphs. The fields in braces must be
 * ones filled by themselves, and the parts in square brackets of a template must be completed.
 */
export const communicationSchema = communicationFields.superRefine((message, ctx) => {
  const hasSession = Boolean(audienceSessionId(message.audience))
  for (const key of ['subject', 'body'] as const) {
    const issue = messageIssue(message[key], hasSession)
    if (issue) ctx.addIssue({ code: 'custom', path: [key], message: issue })
  }
})
export type CommunicationInput = z.infer<typeof communicationSchema>

/** A draft can be saved before the body is written, and with the template's parts still to complete. */
export const communicationDraftSchema = communicationFields.extend({ body: zText(20_000) })
export type CommunicationDraftInput = z.infer<typeof communicationDraftSchema>

/** The preview fills the fields it can: the session chosen, the first name of the first recipient. */
export const emailPreviewSchema = z.object({
  subject: zText(200),
  body: zText(20_000),
  sessionId: z.uuid().optional(),
  firstName: zText(100).optional(),
})

/** A saved message to start from. Its parts in square brackets are completed in each message. */
export const emailTemplateSchema = z
  .object({ name: zRequiredText(80), subject: zRequiredText(200), body: zRequiredText(20_000) })
  .superRefine((template, ctx) => {
    for (const key of ['subject', 'body'] as const) {
      const issue = unknownFieldIssue(template[key])
      if (issue) ctx.addIssue({ code: 'custom', path: [key], message: issue })
    }
  })
export type EmailTemplateInput = z.infer<typeof emailTemplateSchema>

/** Empty query values ("?status=") read as missing. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(value => (value === '' || value === null ? undefined : value), schema.optional())

export const communicationListQuery = zListQuery.extend({
  sessionId: optional(z.uuid()),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const emailLogQuery = zListQuery.extend({
  template: optional(z.string().trim().max(60)),
  status: optional(z.enum(EMAIL_STATUSES)),
  sessionId: optional(z.uuid()),
  communicationId: optional(z.uuid()),
  /** Only the last N days. */
  days: optional(z.coerce.number().int().min(1).max(366)),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
export type EmailLogQuery = z.infer<typeof emailLogQuery>

/** What each template is, in the log. Keys come from the email templates (docs/spec.md, 4). */
export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  'auth.invite': 'Invito all’accesso',
  'auth.verify_email': 'Conferma dell’indirizzo',
  'auth.reset_password': 'Reimpostazione della password',
  'session.invite': 'Invito alla sessione',
  'session.reserve': 'Lista di riserva',
  'session.slot_offered': 'Posto liberato',
  'session.confirmed': 'Sessione confermata',
  'session.cancelled': 'Sessione annullata',
  'session.removed': 'Rimozione dalla sessione',
  'staff.convocation': 'Convocazione',
  'staff.convocation_cancelled': 'Convocazione annullata',
  'staff.approved': 'Candidatura approvata',
  'staff.rejected': 'Esito della candidatura',
  'signature.request': 'Documento da firmare',
  'signature.reminder': 'Promemoria di firma',
  'signature.otp': 'Codice di firma',
  'signature.signed': 'Firma completata',
  communication: 'Comunicazione',
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
  staffStatuses: ConvocationStatus[]
  userIds: string[]
}

export function emptyAudienceDraft(type: AudienceType = 'all_families'): AudienceDraft {
  return {
    type,
    kinds: [...PARTICIPATION_KINDS],
    familyStatuses: [...DEFAULT_FAMILY_STATUSES],
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
      return { type: draft.type, sessionId: draft.sessionId ?? '', statuses: [...draft.staffStatuses] }
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
function orList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} o ${items.at(-1)}`
}

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
      const statuses = audience.statuses ?? [...CONVOCATION_STATUSES]
      if (statuses.length >= CONVOCATION_STATUSES.length) return `Staff di ${session}`
      return statuses.length
        ? `Staff di ${session} (convocazione: ${orList(statuses.map(s => enumLabel('convocationStatus', s).toLowerCase()))})`
        : `Staff di ${session} (nessuno stato scelto)`
    }
    case 'users':
      return plural(new Set(audience.userIds).size, 'persona scelta', 'persone scelte')
  }
}
