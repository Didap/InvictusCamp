// Schemas of the staff area, shared by the forms (UForm) and the API (parseBody), plus the small rules
// both sides need: the moves of a review (docs/spec.md 3.4, 3.5).
import { z } from 'zod'
import { NON_FOOD_ALLERGIES } from '../content/member-form'
import type { NonFoodAllergies, UsefulInfo } from '../types/domain'
import { compact, normalizeUsefulInfo, picked, usefulInfoForm, usefulInfoSchema, zChoices } from './families'
import type { StaffUsefulInfoDto } from '../types/staff'
import {
  COORDINATOR_ROLE,
  PERSONAL_DOCUMENT_CATEGORIES,
  SHIRT_SIZES,
  STAFF_CONTRACTS,
  UPLOAD_MIME_TYPES,
  STAFF_TAG_COLORS,
  STAFF_TEAMS,
  type PersonalDocumentCategory,
  type StaffContract,
  type StaffRole,
  type UploadMimeType,
  type StaffStatus,
  type StaffTeam,
} from '../utils/constants'
import { andList } from '../utils/format'
import { changedKeys } from '../utils/plain'
import {
  requiredResidence,
  zBirthDate,
  zFiscalCode,
  zOptionalText,
  zProvince,
  zRequiredText,
  zText,
  zUuid,
} from './common'

/** The id of a role of `staff_roles` (the server checks it exists). */
export const zStaffRole = z.string().trim().min(1).max(64)
export const zStaffTeam = z.enum(STAFF_TEAMS)
/** The most roles or tags a person can have. */
const STAFF_LABELS_MAX = 40
const zRoles = z.array(zStaffRole).max(STAFF_LABELS_MAX)

// ─── The personal sheet ────────────────────────────────────────────────────────────────────────────

/** The fields of the sheet: required, the province apart. */
const sheetFields = z.object({
  birthDate: zBirthDate,
  birthPlace: zRequiredText(100),
  fiscalCode: zFiscalCode,
  ...requiredResidence,
  /** Nullish: the sheet as stored passes it too (isSheetComplete). */
  province: zProvince.nullish(),
  shirtSize: z.enum(SHIRT_SIZES, { error: 'Scegli la taglia' }),
  contractType: z.enum(STAFF_CONTRACTS).nullish(),
})
export type StaffSheetInput = z.output<typeof sheetFields>

/**
 * The personal sheet of an approved staff or v-team member, as stored once complete (isSheetComplete, its PDF):
 * the contract formula is required of the staff, the v-team volunteer. A field of its own, so its error comes
 * with the others.
 */
const SHEET_SCHEMAS: Record<StaffTeam, z.ZodType<StaffSheetInput>> = {
  staff: sheetFields.extend({ contractType: z.enum(STAFF_CONTRACTS, { error: 'Scegli la formula contrattuale' }) }),
  volunteer: sheetFields,
}
export function staffSheetSchema(team: StaffTeam): z.ZodType<StaffSheetInput> {
  return SHEET_SCHEMAS[team]
}

/** What the home and the sheet say while the sheet is incomplete. */
export function sheetMissing(team: StaffTeam): string {
  const last =
    team === 'staff' ? ', la taglia della maglietta e la formula contrattuale' : ' e la taglia della maglietta'
  return `Ci servono la data e il luogo di nascita, il codice fiscale, la residenza${last}.`
}

/** Whether a sheet as stored passes the form's schema: until then the home asks for it. */
export function isSheetComplete(sheet: Record<keyof StaffSheetInput, string | null>, team: StaffTeam): boolean {
  return SHEET_SCHEMAS[team].safeParse(sheet).success
}

// ─── Health: allergies, diet and other details ─────────────────────────────────────────────────────

export const nonFoodAllergiesSchema = z.object({
  allergies: zChoices(NON_FOOD_ALLERGIES).optional(),
  other: zText(500).optional(),
})

/** The allergies not to food as stored: choices in the order of the list, empty values dropped, null for none. */
export function normalizeNonFoodAllergies(value: NonFoodAllergies | null | undefined): NonFoodAllergies | null {
  return compact<NonFoodAllergies>({
    allergies: picked(NON_FOOD_ALLERGIES, value?.allergies),
    other: value?.other?.trim(),
  })
}

/** The health answers of a staff member, as stored or as typed. */
interface StaffHealthValue {
  info?: UsefulInfo | null
  nonFoodAllergies?: NonFoodAllergies | null
  otherInfo?: string | null
}

/** Whether there is health data to keep: «Informazioni utili», the allergies not to food, the other details. */
export function hasStaffHealth(value: StaffHealthValue): boolean {
  return Boolean(
    normalizeUsefulInfo(value.info) || normalizeNonFoodAllergies(value.nonFoodAllergies) || value.otherInfo?.trim(),
  )
}

/** The health answers as flat fields, normalized: what tells a change (jsonb keeps an object's keys in its order). */
function healthFields(value: StaffHealthValue) {
  const info = normalizeUsefulInfo(value.info)
  const nonFood = normalizeNonFoodAllergies(value.nonFoodAllergies)
  return {
    allergies: info?.allergies,
    diet: info?.diet,
    notes: info?.notes,
    nonFoodAllergies: nonFood?.allergies,
    nonFoodOther: nonFood?.other,
    otherInfo: value.otherInfo?.trim() || undefined,
  }
}

/** The names of the health answers that differ between two values (the audit lists them). */
export function staffHealthChanges(before: StaffHealthValue, after: StaffHealthValue): string[] {
  return changedKeys(healthFields(before), healthFields(after))
}

/** Health data saved new or changed needs the consent ticked then; the same answers keep the consent given. */
export function needsHealthConsent(value: StaffHealthValue, stored: StaffHealthValue): boolean {
  return hasStaffHealth(value) && staffHealthChanges(stored, value).length > 0
}
export const HEALTH_CONSENT_NEEDED = 'Per salvare questi dati serve il tuo consenso'

/**
 * The health answers of the personal sheet: allergies, diet and notes for the canteen (the notes are the «Altro»
 * of the food allergies), the allergies not to food and the other details the camp should know, with the consent
 * box (needsHealthConsent; the server checks it against what is stored). DELETE /api/staff/useful-info withdraws
 * the consent.
 */
export const staffHealthSchema = z.object({
  info: usefulInfoSchema,
  nonFoodAllergies: nonFoodAllergiesSchema.optional(),
  otherInfo: zText(2000).optional(),
  consent: z.boolean().default(false),
})
export type StaffHealthInput = z.output<typeof staffHealthSchema>

/**
 * PUT /api/staff/sheet: the sheet and the health answers, saved together from /staff/scheda (name, email and phone
 * are the account's). `stored` is the health data as saved, to tell whether the consent is needed.
 */
export function staffSheetFormSchema(team: StaffTeam, stored: StaffHealthValue) {
  return SHEET_SCHEMAS[team].and(
    z.object({
      health: staffHealthSchema.refine(health => health.consent || !needsHealthConsent(health, stored), {
        path: ['consent'],
        error: HEALTH_CONSENT_NEEDED,
      }),
    }),
  )
}

/** The health data as the form of /staff/scheda holds it: every field present, the consent box empty. */
export function staffHealthForm(health: StaffUsefulInfoDto) {
  return {
    info: usefulInfoForm(health.info),
    nonFoodAllergies: {
      allergies: [...(health.nonFoodAllergies?.allergies ?? [])],
      other: health.nonFoodAllergies?.other ?? '',
    },
    otherInfo: health.otherInfo ?? '',
    consent: false,
  }
}
export type StaffHealthForm = ReturnType<typeof staffHealthForm>

/**
 * Where a person sits in the base of a session (spec 3.5): a coordinator (one per team), or one of the
 * staff (counted toward `staffNeeded`) or of the v-team.
 */
export function staffSlot(person: { team: StaffTeam; role: StaffRole | null }): 'coordinator' | StaffTeam {
  return person.role === COORDINATOR_ROLE ? 'coordinator' : person.team
}

/** `staffNeeded` counts the people of the staff team, the coordinators aside. */
export function countsTowardNeeded(person: { team: StaffTeam; role: StaffRole | null }): boolean {
  return staffSlot(person) === 'staff'
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

/** PUT /api/admin/staff/:userId/roles: the roles the administration gives the person. */
export const staffRolesSchema = z.object({ roles: zRoles })

/** PUT /api/admin/staff/:userId/tags: the «Valutazione», tags of `staff_tags`. */
export const staffTagsSchema = z.object({ tags: z.array(zUuid).max(STAFF_LABELS_MAX) })

/** POST /api/admin/staff/roles, PUT /api/admin/staff/roles/:id: a role of staff and v-team. */
export const staffRoleInputSchema = z.object({ name: zRequiredText(60) })
export type StaffRoleInput = z.infer<typeof staffRoleInputSchema>

/** POST /api/admin/training, PUT /api/admin/training/:id: a training proposed in «Formazione». */
export const trainingOptionSchema = z.object({ title: zRequiredText(120), description: zOptionalText(500) })
export type TrainingOptionInput = z.infer<typeof trainingOptionSchema>

/** PUT /api/staff/training/:id: interested or not. */
export const trainingInterestSchema = z.object({ interested: z.boolean() })

/** POST /api/admin/staff/tags, PUT /api/admin/staff/tags/:id: a tag of the «Valutazione». */
export const staffTagInputSchema = z.object({ name: zRequiredText(40), color: z.enum(STAFF_TAG_COLORS) })
export type StaffTagInput = z.infer<typeof staffTagInputSchema>

/** The filter of /admin/staff by age: years at today, from the birth date of the application. */
export const STAFF_AGE_FILTERS = [
  { value: 'under25', label: 'Meno di 25 anni', min: 0, max: 24 },
  { value: '25to34', label: 'Da 25 a 34 anni', min: 25, max: 34 },
  { value: '35to49', label: 'Da 35 a 49 anni', min: 35, max: 49 },
  { value: 'over50', label: '50 anni o più', min: 50, max: Infinity },
] as const

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

/** «Conferma le preferenze»: the sessions the page showed. */
export const availabilityConfirmSchema = z.object({ sessionIds: z.array(zUuid).max(500) })

// ─── Convocations ──────────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/staff?team=&sessionId=: one team, and whether each person gave availability for that session. */
export const staffListQuerySchema = z.object({ team: zStaffTeam.optional(), sessionId: zUuid.optional() })

/** GET /api/admin/convocations?sessionId= */
export const sessionStaffQuerySchema = z.object({ sessionId: zUuid })

/** POST /api/admin/convocations: people added to a session as convocations to send. */
export const convocationAddSchema = z.object({
  sessionId: zUuid,
  people: z
    .array(z.object({ userId: zUuid, role: zStaffRole.nullable() }))
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

/**
 * What every staff and v-team member in the staff area uploads (spec 3.4), in PDF only: a CV (the one sent with the
 * application counts) and an ID. Each has its place on /staff/documenti.
 */
export const REQUIRED_STAFF_DOCUMENTS = ['cv', 'id_document'] as const satisfies readonly PersonalDocumentCategory[]
export type RequiredStaffDocument = (typeof REQUIRED_STAFF_DOCUMENTS)[number]
const REQUIRED_DOCUMENT_NAMES: Record<RequiredStaffDocument, string> = {
  cv: 'il curriculum',
  id_document: 'il documento d’identità',
}

/** «il curriculum e il documento d’identità»: the required documents in a sentence. */
export function requiredDocumentsText(missing: readonly RequiredStaffDocument[]): string {
  return andList(missing.map(document => REQUIRED_DOCUMENT_NAMES[document]))
}

export function isRequiredStaffDocument(category: PersonalDocumentCategory): category is RequiredStaffDocument {
  return (REQUIRED_STAFF_DOCUMENTS as readonly string[]).includes(category)
}

/** The formats a staff member's document is taken in: the required ones in PDF only. */
export function staffDocumentTypes(category: PersonalDocumentCategory): readonly UploadMimeType[] {
  return isRequiredStaffDocument(category) ? ['application/pdf'] : UPLOAD_MIME_TYPES
}

/** The text fields sent with the file to POST /api/staff/documents. */
export const staffDocumentSchema = z.object({
  category: z.enum(PERSONAL_DOCUMENT_CATEGORIES).refine(value => value !== 'diagnosis', {
    error: 'Categoria non valida',
  }),
  title: zRequiredText(150),
})
export type StaffDocumentInput = z.infer<typeof staffDocumentSchema>
