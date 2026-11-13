// Schemas of the families area (A3), shared by the forms (UForm) and the API (parseBody, parseQuery),
// plus the pure rules of the questionnaire and of the health details, used on both sides.
import { z } from 'zod'
import { FAMILY_FORM_QUESTIONS, type FormQuestion } from '../content/family-form'
import { ALLERGIES, DIETS, DISABILITY_CHOICES, type Choice, type DisabilityChoiceKey } from '../content/member-form'
import type { MemberHealth } from '../types/families'
import type { DisabilityInfo, FormAnswers, UsefulInfo } from '../types/domain'
import {
  FAMILY_FORM_STATUSES,
  ITALIAN_REGIONS,
  MEMBER_KINDS,
  MEMBER_RELATIONSHIPS,
  PERSONAL_DOCUMENT_CATEGORIES,
  type MemberKind,
  type PersonalDocumentCategory,
} from '../utils/constants'
import { isIsoDay, todayIso } from '../utils/dates'
import { missingBirthDate, missingRelationship } from '../utils/format'
import { zListQuery, zPersonName, zPhone, zRequiredPhone, zRequiredText, zText, zUuid } from './common'

/** An Italian province as its two-letter code ("TA"); empty is allowed. */
const zProvince = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([A-Z]{2})?$/, { error: 'Scrivi la sigla di due lettere, per esempio TA' })

/** A CAP: five digits; empty is allowed. */
const zPostalCode = z
  .string()
  .trim()
  .regex(/^(\d{5})?$/, { error: 'Il CAP ha cinque cifre, per esempio 74024' })

const zRegion = z.enum(ITALIAN_REGIONS, { error: 'Scegli la regione' })

/** Family name, residence and phone, as the administration edits them on the family's behalf. */
export const familyProfileSchema = z.object({
  name: zRequiredText(120),
  address: zText(200).optional(),
  city: zText(100).optional(),
  postalCode: zPostalCode.optional(),
  province: zProvince.optional(),
  region: z.union([zRegion, z.literal('')]).optional(),
  phone: zPhone.optional(),
})
export type FamilyProfileInput = z.output<typeof familyProfileSchema>

// ─── The family data (the first form of the family) ─────────────────────────────────────────────────

/** At most this many people of one kind: a guard against typing errors, not a rule of the camp. */
export const MAX_MEMBERS_OF_A_KIND = 12

const zCount = (min: number) =>
  z
    .number({ error: 'Indica un numero' })
    .int({ error: 'Indica un numero intero' })
    .min(min, { error: min ? `Almeno ${min}` : 'Non può essere negativo' })
    .max(MAX_MEMBERS_OF_A_KIND, { error: `Al massimo ${MAX_MEMBERS_OF_A_KIND}` })

/** How many people the family is made of. Confirming the data creates one card per person. */
export const familyCompositionSchema = z.object({
  /** The account holder is one of them. */
  adults: zCount(1),
  /** Young people with a severe or chronic illness, a neurodevelopmental disorder or a disability. */
  youngWithCondition: zCount(0),
  youngWithoutCondition: zCount(0),
})
export type FamilyComposition = z.output<typeof familyCompositionSchema>

/**
 * The three numbers of the composition: what a card of each group is, and how the form and the
 * messages name the group.
 */
export const COMPOSITION_GROUPS = [
  { key: 'adults', kind: 'adult', hasDisability: false, label: 'Adulti', help: 'Contando anche te.' },
  {
    key: 'youngWithCondition',
    kind: 'young',
    hasDisability: true,
    label: 'Ragazzi e ragazze con patologie gravi o croniche, disturbi del neurosviluppo o disabilità',
  },
  {
    key: 'youngWithoutCondition',
    kind: 'young',
    hasDisability: false,
    label: 'Ragazzi e ragazze senza patologie o disabilità (fratelli e sorelle)',
  },
] as const satisfies readonly {
  key: keyof FamilyComposition
  kind: MemberKind
  hasDisability: boolean
  label: string
  help?: string
}[]

/** Which number of the composition a card counts in. */
export function compositionGroupOf(card: { kind: MemberKind; hasDisability: boolean }): keyof FamilyComposition {
  if (card.kind === 'adult') return 'adults'
  return card.hasDisability ? 'youngWithCondition' : 'youngWithoutCondition'
}

/** The cards of a family counted by group. */
export function countCards(cards: { kind: MemberKind; hasDisability: boolean }[]): FamilyComposition {
  const counts: FamilyComposition = { adults: 0, youngWithCondition: 0, youngWithoutCondition: 0 }
  for (const card of cards) counts[compositionGroupOf(card)]++
  return counts
}

/**
 * The fields of the family data form (/famiglia/profilo): phone and residence required, the composition,
 * and the consent to health data, needed when the family declares a young person with a condition.
 */
export const familyDataFieldsSchema = familyProfileSchema.extend({
  phone: zRequiredPhone,
  address: zRequiredText(200),
  city: zRequiredText(100),
  postalCode: zPostalCode.refine(value => value !== '', { error: 'Campo obbligatorio' }),
  region: zRegion,
  composition: familyCompositionSchema,
  healthConsent: z.boolean().default(false),
})

const zAnswer = z.union([z.string().max(5000), z.array(z.string().max(300)).max(50), z.boolean(), z.null()])

/** PUT /api/family/profile: the family data with the answers to the questions. */
export const familyDataSchema = familyDataFieldsSchema.extend({
  answers: z.record(z.string().max(80), zAnswer),
})
export type FamilyDataInput = z.output<typeof familyDataSchema>

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

/** One of the keys of `options`; typed as a string, so a form can hold it before it is checked. */
const zChoice = (options: readonly Choice[]) =>
  z.string().refine(value => options.some(option => option.value === value), { error: 'Scelta non valida' })
const zChoices = (options: readonly Choice[]) => z.array(zChoice(options)).max(options.length)
const zDetail = zText(2000).optional()
/** The «Nessun supporto», «Nessuna terapia» of a list: alone or not at all. */
const NONE = 'none'

export const disabilityInfoSchema = z.object({
  ...(Object.fromEntries(DISABILITY_CHOICES.map(field => [field.key, zChoices(field.options).optional()])) as Record<
    DisabilityChoiceKey,
    z.ZodOptional<ReturnType<typeof zChoices>>
  >),
  foodSelectivity: zDetail,
  notes: zDetail,
})

export const usefulInfoSchema = z.object({
  allergies: zChoices(ALLERGIES).optional(),
  /** '' is no preference. */
  diet: z.union([zChoice(DIETS), z.literal('')]).optional(),
  notes: zText(1000).optional(),
})

export const memberHealthSchema = z
  .object({
    hasDisability: z.boolean(),
    disability: disabilityInfoSchema.nullable().optional(),
    info: usefulInfoSchema.nullable().optional(),
  })
  .superRefine((health, ctx) => {
    if (!health.hasDisability) return
    for (const { key } of DISABILITY_CHOICES) {
      const chosen = health.disability?.[key] ?? []
      if (!chosen.length) {
        ctx.addIssue({ code: 'custom', path: ['disability', key], message: 'Scegli almeno una risposta' })
      } else if (chosen.length > 1 && chosen.includes(NONE)) {
        ctx.addIssue({ code: 'custom', path: ['disability', key], message: '«Nessuno» non va con le altre risposte' })
      }
    }
  })

const zBirthDate = z
  .string()
  .refine(isIsoDay, { error: 'Data non valida' })
  .refine(day => day >= '1900-01-01', { error: 'Data non valida' })
  .refine(day => day <= todayIso(), { error: 'La data di nascita non può essere nel futuro' })

/**
 * A member of the family; an adult's birth date is required. `health` is accepted only with the consent;
 * when absent it stays as it is.
 */
const memberFields = z.object({
  firstName: zPersonName,
  lastName: zPersonName,
  birthDate: z.preprocess(value => (value === '' ? null : value), zBirthDate.nullable()).optional(),
  /** Null for the young person with a condition: everyone else's relationship is to them. */
  relationship: z.enum(MEMBER_RELATIONSHIPS, { error: 'Scegli il legame di parentela' }).nullable().optional(),
  kind: z.enum(MEMBER_KINDS, { error: 'Indica se è un adulto o un ragazzo o ragazza' }),
  isReferent: z.boolean().default(false),
  health: memberHealthSchema.optional(),
})
const birthDateFields = memberFields.pick({ kind: true, birthDate: true })
const relationshipFields = memberFields.pick({ kind: true, relationship: true, health: true })

// Whenever the fields a check reads are valid, also while another field is wrong: every missing field at once.
export const memberSchema = memberFields
  // Only a young person can be the one with a condition (the composition counts them so).
  .refine(member => !member.health?.hasDisability || member.kind === 'young', {
    path: ['kind'],
    error: 'Solo un ragazzo o una ragazza può avere una patologia o disabilità indicata',
  })
  .refine(member => !missingBirthDate(member), {
    path: ['birthDate'],
    error: 'Campo obbligatorio',
    when: ({ value }) => birthDateFields.safeParse(value).success,
  })
  .refine(
    // Without `health` (no consent) the server knows whether a young person's card is the one with a condition.
    member =>
      !missingRelationship({ ...member, hasDisability: member.health?.hasDisability ?? member.kind === 'young' }),
    {
      path: ['relationship'],
      error: 'Scegli il legame di parentela',
      when: ({ value }) => relationshipFields.safeParse(value).success,
    },
  )
export type MemberInput = z.output<typeof memberSchema>

export const NO_HEALTH: MemberHealth = { hasDisability: false, disability: null, info: null }

/** The keys picked, in the order of the options, each once. */
function picked(options: readonly Choice[], chosen: readonly string[] | undefined): string[] {
  return options.flatMap(option => (chosen?.includes(option.value) ? [option.value] : []))
}

/** Only what has a value; null when nothing has. */
function compact<T extends object>(value: T): T | null {
  const entries = Object.entries(value).filter(([, item]) => (Array.isArray(item) ? item.length : item))
  return entries.length ? (Object.fromEntries(entries) as T) : null
}

/**
 * Health data as it is stored: the disability details only for a person with a condition, choices in the
 * order of the options, empty values dropped.
 */
export function normalizeHealth(
  input: { hasDisability: boolean; disability?: DisabilityInfo | null; info?: UsefulInfo | null } | null | undefined,
): MemberHealth {
  const info = compact<UsefulInfo>({
    allergies: picked(ALLERGIES, input?.info?.allergies),
    diet: input?.info?.diet || undefined,
    notes: input?.info?.notes?.trim(),
  })
  if (!input?.hasDisability) return { ...NO_HEALTH, info }
  const details = input.disability
  const disability = compact<DisabilityInfo>({
    ...Object.fromEntries(DISABILITY_CHOICES.map(field => [field.key, picked(field.options, details?.[field.key])])),
    foodSelectivity: details?.foodSelectivity?.trim(),
    notes: details?.notes?.trim(),
  })
  return { hasDisability: true, disability, info }
}

export function hasHealthData(health: MemberHealth): boolean {
  return health.hasDisability || Boolean(health.disability) || Boolean(health.info)
}

const DISABILITY_KEYS = [...DISABILITY_CHOICES.map(field => field.key), 'foodSelectivity', 'notes'] as const
const INFO_KEYS = ['allergies', 'diet', 'notes'] as const

/** The names (never the values) of the health fields that differ: the data of `member.health_update`. */
export function healthChangedFields(before: MemberHealth, after: MemberHealth): string[] {
  const differs = (a: unknown, b: unknown) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
  return [
    ...(before.hasDisability !== after.hasDisability ? ['hasDisability'] : []),
    ...DISABILITY_KEYS.filter(key => differs(before.disability?.[key], after.disability?.[key])),
    ...INFO_KEYS.filter(key => differs(before.info?.[key], after.info?.[key])).map(key => `info.${key}`),
  ]
}

/** PUT /api/family/members/consent */
export const healthConsentSchema = z.object({ given: z.boolean() })

// ─── Personal documents ─────────────────────────────────────────────────────────────────────────────

/** The text fields that come with an upload (multipart): POST /api/family/documents. */
export const personalDocumentSchema = z.object({
  category: z.enum(PERSONAL_DOCUMENT_CATEGORIES, { error: 'Scegli il tipo di documento' }),
  title: zRequiredText(150),
  familyMemberId: z.preprocess(value => (value === '' || value === null ? undefined : value), zUuid.optional()),
})
export type PersonalDocumentInput = z.output<typeof personalDocumentSchema>

/** Documents that carry health data: a family uploads them only with the consent, withdrawing it deletes them. */
export const HEALTH_DOCUMENT_CATEGORIES: readonly PersonalDocumentCategory[] = ['medical_certificate', 'diagnosis']

export function isHealthDocument(category: PersonalDocumentCategory): boolean {
  return HEALTH_DOCUMENT_CATEGORIES.includes(category)
}

// ─── Administration ─────────────────────────────────────────────────────────────────────────────────

export const FAMILY_LIST_SORTS = ['name', 'city', 'members', 'createdAt'] as const
export type FamilyListSort = (typeof FAMILY_LIST_SORTS)[number]

/** GET /api/admin/families (and its CSV export). */
export const adminFamilyListQuerySchema = zListQuery.extend({
  formStatus: z.enum(FAMILY_FORM_STATUSES).optional(),
  province: z.string().trim().toUpperCase().max(40).optional(),
  region: zRegion.optional(),
  /** Families with (yes) or without (no) a member with a disability (the list shows only their ages). */
  disability: z.enum(['yes', 'no']).optional(),
  sort: z.enum(FAMILY_LIST_SORTS).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
})
export type AdminFamilyListQuery = z.output<typeof adminFamilyListQuerySchema>

/** PUT /api/admin/families/:id/notes */
export const adminNotesSchema = z.object({ adminNotes: zText(5000) })
