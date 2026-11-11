// Schemas of the staff area, shared by the forms (UForm) and the API (parseBody), plus the small rules
// both sides need: what an application lacks, the moves of a review (docs/spec.md 3.4, 3.5).
import { z } from 'zod'
import {
  PERSONAL_DOCUMENT_CATEGORIES,
  STAFF_ROLES,
  STAFF_TEAMS,
  type PersonalDocumentCategory,
  type StaffStatus,
} from '../utils/constants'
import { todayIso } from '../utils/dates'
import { zIsoDay, zRequiredText, zText, zUuid } from './common'

export const zStaffRole = z.enum(STAFF_ROLES)
export const zStaffTeam = z.enum(STAFF_TEAMS)

const zBirthDate = zIsoDay.refine(day => day >= '1920-01-01' && day < todayIso(), {
  error: 'Data di nascita non valida',
})

// ─── Application ───────────────────────────────────────────────────────────────────────────────────

/** POST /api/staff/application/submit: the whole application (the CV is checked on the server). */
export const staffApplicationSchema = z.object({
  team: zStaffTeam,
  birthDate: zBirthDate,
  city: zRequiredText(100),
  roles: z.array(zStaffRole).min(1, { error: 'Scegli almeno un ruolo' }).max(STAFF_ROLES.length),
  qualifications: zRequiredText(2000),
  experience: zRequiredText(4000),
  motivation: zRequiredText(2000),
})
export type StaffApplicationInput = z.infer<typeof staffApplicationSchema>

/** PUT /api/staff/application: a draft, every field may be empty. */
export const staffApplicationDraftSchema = z.object({
  team: zStaffTeam.optional(),
  birthDate: zBirthDate.nullable().optional(),
  city: zText(100).nullable().optional(),
  roles: z.array(zStaffRole).max(STAFF_ROLES.length).optional(),
  qualifications: zText(2000).nullable().optional(),
  experience: zText(4000).nullable().optional(),
  motivation: zText(2000).nullable().optional(),
})
export type StaffApplicationDraft = z.infer<typeof staffApplicationDraftSchema>

interface ApplicationFields {
  birthDate: string | null
  city: string | null
  roles: readonly string[]
  qualifications: string | null
  experience: string | null
  motivation: string | null
  cvFileId?: string | null
  cv?: unknown
}

/** The parts of an application, as the labels of the form (the checklist of the staff home). */
export const APPLICATION_CHECKLIST = [
  'Data di nascita',
  'Città',
  'Ruoli',
  'Titoli e qualifiche',
  'Esperienze',
  'Motivazione',
  'CV in PDF',
] as const
export type ApplicationPart = (typeof APPLICATION_CHECKLIST)[number]

/** What the application still lacks before it can be sent, in the order of the form. */
export function applicationMissing(profile: ApplicationFields): ApplicationPart[] {
  const filled: Record<ApplicationPart, boolean> = {
    'Data di nascita': Boolean(profile.birthDate),
    Città: Boolean(profile.city?.trim()),
    Ruoli: profile.roles.length > 0,
    'Titoli e qualifiche': Boolean(profile.qualifications?.trim()),
    Esperienze: Boolean(profile.experience?.trim()),
    Motivazione: Boolean(profile.motivation?.trim()),
    'CV in PDF': Boolean(profile.cvFileId || profile.cv),
  }
  return APPLICATION_CHECKLIST.filter(part => !filled[part])
}

// ─── Review ────────────────────────────────────────────────────────────────────────────────────────

/**
 * The moves of the administration on a profile. A decision on an application (applied → approved or
 * rejected, rejected → approved) is a review; approved ⇄ inactive stops or resumes the convocations.
 * None of them sends an email: the outcome leaves only from "Comunica l’esito".
 */
export const STAFF_STATUS_MOVES: Record<StaffStatus, readonly StaffStatus[]> = {
  registered: [],
  applied: ['approved', 'rejected'],
  approved: ['inactive'],
  rejected: ['approved'],
  inactive: ['approved'],
}

export function canMoveStaff(from: StaffStatus, to: StaffStatus): boolean {
  return STAFF_STATUS_MOVES[from].includes(to)
}

/** True when the move is a decision on the application (recorded as the review). */
export function isReviewMove(from: StaffStatus, to: StaffStatus): boolean {
  return (from === 'applied' || from === 'rejected') && (to === 'approved' || to === 'rejected')
}

/** POST /api/admin/staff/:userId/status */
export const staffStatusSchema = z.object({
  status: z.enum(['approved', 'rejected', 'inactive']),
  notes: zText(4000).nullable().optional(),
})
export type StaffStatusInput = z.infer<typeof staffStatusSchema>

/** PUT /api/admin/staff/:userId/team */
export const staffTeamSchema = z.object({ team: zStaffTeam })

/** PUT /api/admin/staff/:userId/notes */
export const staffNotesSchema = z.object({ notes: zText(4000) })

/** POST /api/admin/staff/:userId/outcome: the message the administration wrote (or kept). */
export const staffOutcomeSchema = z.object({ message: zRequiredText(5000) })
export type StaffOutcomeInput = z.infer<typeof staffOutcomeSchema>

/** POST /api/admin/staff/approve: several applications at once. */
export const staffBulkApproveSchema = z.object({
  userIds: z.array(zUuid).min(1, { error: 'Scegli almeno una candidatura' }).max(200),
})

// ─── Availability ──────────────────────────────────────────────────────────────────────────────────

/** PUT /api/staff/availability/:sessionId: whether the person can come to the whole session. */
export const availabilityAnswerSchema = z.object({ available: z.boolean() })

// ─── Convocations ──────────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/staff?sessionId=: whether each person gave availability for that session. */
export const staffListQuerySchema = z.object({ sessionId: zUuid.optional() })

/** GET /api/admin/convocations?sessionId= */
export const sessionStaffQuerySchema = z.object({ sessionId: zUuid })

/** POST /api/admin/convocations: people added to a session as convocations to send. */
export const convocationAddSchema = z.object({
  sessionId: zUuid,
  people: z
    .array(z.object({ userId: zUuid, role: zStaffRole }))
    .min(1, { error: 'Scegli almeno una persona' })
    .max(200),
})
export type ConvocationAddInput = z.infer<typeof convocationAddSchema>

/** POST /api/admin/convocations/send */
export const convocationSendSchema = z.object({
  sessionId: zUuid,
  ids: z.array(zUuid).min(1, { error: 'Scegli almeno una convocazione' }).max(200),
  message: zText(2000).nullable().optional(),
})
export type ConvocationSendInput = z.infer<typeof convocationSendSchema>

/** PATCH /api/admin/convocations/:id */
export const convocationRoleSchema = z.object({ role: zStaffRole })

/** POST /api/staff/convocations/:id/decline */
export const convocationDeclineSchema = z.object({ reason: zText(500).nullable().optional() })

// ─── Personal documents ────────────────────────────────────────────────────────────────────────────

/** Categories a staff member can choose (diagnoses are for families). */
export const STAFF_DOCUMENT_CATEGORIES = PERSONAL_DOCUMENT_CATEGORIES.filter(
  category => category !== 'diagnosis',
) as Exclude<PersonalDocumentCategory, 'diagnosis'>[]

/** The text fields sent with the file to POST /api/staff/documents. */
export const staffDocumentSchema = z.object({
  category: z.enum(PERSONAL_DOCUMENT_CATEGORIES).refine(value => value !== 'diagnosis', {
    error: 'Categoria non valida',
  }),
  title: zRequiredText(150),
})
export type StaffDocumentInput = z.infer<typeof staffDocumentSchema>
