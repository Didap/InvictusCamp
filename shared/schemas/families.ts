// Schemas of the families area (A3), shared by the forms (UForm) and the API (parseBody, parseQuery),
// plus the pure rules of the questionnaire and of the health details, used on both sides.
import { z } from 'zod'
import { FAMILY_FORM_QUESTIONS, type FormQuestion } from '../content/family-form'
import type { MemberHealth } from '../types/families'
import type { DisabilityInfo, FormAnswers } from '../types/domain'
import { FAMILY_FORM_STATUSES, MEMBER_RELATIONSHIPS, PERSONAL_DOCUMENT_CATEGORIES } from '../utils/constants'
import { isIsoDay, todayIso } from '../utils/dates'
import { zListQuery, zPersonName, zPhone, zRequiredText, zText, zUuid } from './common'

/** An Italian province as its two-letter code ("TA"); empty is allowed. */
const zProvince = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([A-Z]{2})?$/, { error: 'Scrivi la sigla di due lettere, per esempio TA' })

/** Family data: /famiglia/profilo, and the administration on the family's behalf. */
export const familyProfileSchema = z.object({
  name: zRequiredText(120),
  address: zText(200).optional(),
  city: zText(100).optional(),
  province: zProvince.optional(),
  phone: zPhone.optional(),
})
export type FamilyProfileInput = z.output<typeof familyProfileSchema>

// ─── Questionnaire ──────────────────────────────────────────────────────────────────────────────────

const zAnswer = z.union([z.string().max(5000), z.array(z.string().max(300)).max(50), z.boolean(), z.null()])

/** PUT /api/family/profile/form: the answers, saved as a draft or sent (`submit`). */
export const familyFormSchema = z.object({
  answers: z.record(z.string().max(80), zAnswer),
  submit: z.boolean().default(false),
})
export type FamilyFormInput = z.output<typeof familyFormSchema>

const TEXT_MAX = { text: 300, textarea: 4000 } as const

/** True when a question has an answer (a ticked "no" counts, an empty text does not). */
export function isAnswered(value: FormAnswers[string] | undefined): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

/**
 * The answers worth keeping: questions of the current questionnaire only, values checked against
 * their type and options, empty answers dropped. `invalid` lists the questions with a wrong value.
 */
export function normalizeFormAnswers(answers: FormAnswers): { answers: FormAnswers; invalid: FormQuestion[] } {
  const clean: FormAnswers = {}
  const invalid: FormQuestion[] = []
  for (const question of FAMILY_FORM_QUESTIONS) {
    const value = answers[question.id]
    if (value === undefined || value === null) continue
    if (question.type === 'text' || question.type === 'textarea') {
      if (typeof value !== 'string' || value.trim().length > TEXT_MAX[question.type]) invalid.push(question)
      else if (value.trim()) clean[question.id] = value.trim()
    } else if (question.type === 'select') {
      if (value === '') continue
      if (typeof value !== 'string' || !question.options?.includes(value)) invalid.push(question)
      else clean[question.id] = value
    } else if (question.type === 'multiselect') {
      if (!Array.isArray(value) || value.some(option => !question.options?.includes(option))) invalid.push(question)
      else {
        // In the order of the options, each once.
        const picked = (question.options ?? []).filter(option => value.includes(option))
        if (picked.length) clean[question.id] = picked
      }
    } else if (typeof value !== 'boolean') invalid.push(question)
    else clean[question.id] = value
  }
  return { answers: clean, invalid }
}

/** Required questions still without an answer. */
export function missingRequiredQuestions(answers: FormAnswers): FormQuestion[] {
  return FAMILY_FORM_QUESTIONS.filter(question => question.required && !isAnswered(answers[question.id]))
}

// ─── Members and health details ─────────────────────────────────────────────────────────────────────

/** The fields of DisabilityInfo as the forms ask them (placeholder until sprint 2). */
export const DISABILITY_FIELDS = [
  {
    key: 'description',
    label: 'Diagnosi o descrizione della condizione',
    help: 'Con parole tue, quello che ci serve sapere.',
  },
  {
    key: 'supportNeeds',
    label: 'Bisogni di supporto nella giornata',
    help: 'Per esempio pasti, igiene, sonno, autonomie.',
  },
  { key: 'mobility', label: 'Mobilità e ausili', help: 'Per esempio carrozzina, deambulatore, scale.' },
  {
    key: 'communication',
    label: 'Comunicazione',
    help: 'Come comunica e cosa lo aiuta a capire, per esempio CAA, LIS, frasi brevi.',
  },
  {
    key: 'medicalNotes',
    label: 'Terapie, allergie e note mediche',
    help: 'Farmaci e orari, allergie, cosa fare in caso di crisi.',
  },
] as const satisfies readonly { key: keyof DisabilityInfo; label: string; help: string }[]

const zDetail = zText(2000).optional()

export const disabilityInfoSchema = z.object({
  description: zDetail,
  supportNeeds: zDetail,
  mobility: zDetail,
  communication: zDetail,
  medicalNotes: zDetail,
})

export const memberHealthSchema = z.object({
  hasDisability: z.boolean(),
  disability: disabilityInfoSchema.nullable().optional(),
})

const zBirthDate = z
  .string()
  .refine(isIsoDay, { error: 'Data non valida' })
  .refine(day => day >= '1900-01-01', { error: 'Data non valida' })
  .refine(day => day <= todayIso(), { error: 'La data di nascita non può essere nel futuro' })

/** A member of the family. `health` is accepted only with the consent; when absent it stays as it is. */
export const memberSchema = z.object({
  firstName: zPersonName,
  lastName: zPersonName,
  birthDate: z.preprocess(value => (value === '' ? null : value), zBirthDate.nullable()).optional(),
  relationship: z.enum(MEMBER_RELATIONSHIPS, { error: 'Scegli la parentela' }),
  isReferent: z.boolean().default(false),
  health: memberHealthSchema.optional(),
})
export type MemberInput = z.output<typeof memberSchema>

export const NO_HEALTH: MemberHealth = { hasDisability: false, disability: null }

/** Health details as they are stored: details only for a person with a disability, empty fields dropped. */
export function normalizeHealth(
  input: { hasDisability: boolean; disability?: DisabilityInfo | null } | null | undefined,
): MemberHealth {
  if (!input?.hasDisability) return { ...NO_HEALTH }
  const details: DisabilityInfo = {}
  for (const { key } of DISABILITY_FIELDS) {
    const value = input.disability?.[key]?.trim()
    if (value) details[key] = value
  }
  return { hasDisability: true, disability: Object.keys(details).length ? details : null }
}

export function hasHealthData(health: MemberHealth): boolean {
  return health.hasDisability || Boolean(health.disability && Object.keys(health.disability).length)
}

/** The names (never the values) of the health fields that differ: the data of `member.health_update`. */
export function healthChangedFields(before: MemberHealth, after: MemberHealth): string[] {
  const fields: string[] = []
  if (before.hasDisability !== after.hasDisability) fields.push('hasDisability')
  for (const { key } of DISABILITY_FIELDS) {
    if ((before.disability?.[key] ?? '') !== (after.disability?.[key] ?? '')) fields.push(key)
  }
  return fields
}

/** PUT /api/family/members/consent */
export const healthConsentSchema = z.object({ given: z.boolean() })

/** Age in whole years on `today`. */
export function ageOn(birthDate: string, today: string = todayIso()): number {
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4))
  return today.slice(5) < birthDate.slice(5) ? years - 1 : years
}

// ─── Personal documents ─────────────────────────────────────────────────────────────────────────────

/** The text fields that come with an upload (multipart): POST /api/family/documents. */
export const personalDocumentSchema = z.object({
  category: z.enum(PERSONAL_DOCUMENT_CATEGORIES, { error: 'Scegli il tipo di documento' }),
  title: zRequiredText(150),
  familyMemberId: z.preprocess(value => (value === '' || value === null ? undefined : value), zUuid.optional()),
})
export type PersonalDocumentInput = z.output<typeof personalDocumentSchema>

// ─── Administration ─────────────────────────────────────────────────────────────────────────────────

export const FAMILY_LIST_SORTS = ['name', 'city', 'members', 'createdAt'] as const
export type FamilyListSort = (typeof FAMILY_LIST_SORTS)[number]

/** GET /api/admin/families (and its CSV export). */
export const adminFamilyListQuerySchema = zListQuery.extend({
  formStatus: z.enum(FAMILY_FORM_STATUSES).optional(),
  province: z.string().trim().toUpperCase().max(40).optional(),
  /** Families with (yes) or without (no) a member with a disability. Never shown as a column. */
  disability: z.enum(['yes', 'no']).optional(),
  sort: z.enum(FAMILY_LIST_SORTS).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
})
export type AdminFamilyListQuery = z.output<typeof adminFamilyListQuerySchema>

/** PUT /api/admin/families/:id/notes */
export const adminNotesSchema = z.object({ adminNotes: zText(5000) })
