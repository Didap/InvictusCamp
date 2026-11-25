import { z } from 'zod'
import { ITALIAN_REGIONS, type ItalianRegion } from '../utils/constants'
import { isIsoDay, todayIso } from '../utils/dates'

// Italian messages for every schema, on the client (UForm) and on the server (parseBody).
z.config(z.locales.it())

export const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Indirizzo email non valido' }))

export const zPassword = z
  .string()
  .min(8, { error: 'Almeno 8 caratteri' })
  .max(200, { error: 'Al massimo 200 caratteri' })

export const zPersonName = z
  .string()
  .trim()
  .min(1, { error: 'Campo obbligatorio' })
  .max(100, { error: 'Al massimo 100 caratteri' })

/** An empty field ('' or null, as forms and query strings send it) reads as missing. */
export const blankAsMissing = (value: unknown) => (value === '' || value === null ? undefined : value)

/** A person's birth date, required. */
export const zBirthDate = z.preprocess(
  blankAsMissing,
  z
    .string({ error: 'Campo obbligatorio' })
    .refine(day => isIsoDay(day) && day >= '1900-01-01', { error: 'Data non valida' })
    .refine(day => day <= todayIso(), { error: 'La data di nascita non può essere nel futuro' }),
)

export const zPhone = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+0-9 ().-]*$/, { error: 'Numero di telefono non valido' })

/** A phone the camp needs to call: the family's. */
export const zRequiredPhone = zPhone.min(1, { error: 'Campo obbligatorio' })

/** Free text, trimmed, with a maximum length. */
export const zText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Al massimo ${max} caratteri` })

/** Optional free text: empty becomes null. */
export const zOptionalText = (max: number) =>
  zText(max)
    .nullish()
    .transform(value => value || null)

/** Required free text. */
export const zRequiredText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: 'Campo obbligatorio' })
    .max(max, { error: `Al massimo ${max} caratteri` })

/** A day that exists, YYYY-MM-DD: 2027-02-30 is refused here, not by the database. */
export const zIsoDay = z.string().refine(isIsoDay, { error: 'Data non valida' })

export const zUuid = z.uuid()

/** A token from an email link. */
export const zToken = z.string().min(20).max(200)

/** Pagination and search for admin lists. */
export const zListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})
export type ListQuery = z.infer<typeof zListQuery>

// ─── Residence and identity ────────────────────────────────────────────────────────────────────────

/** An Italian province as its two-letter code ("TA"); empty is allowed. */
export const zProvince = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([A-Z]{2})?$/, { error: 'Scrivi la sigla di due lettere, per esempio TA' })

/** A CAP: five digits; empty is allowed. */
export const zPostalCode = z
  .string()
  .trim()
  .regex(/^(\d{5})?$/, { error: 'Il CAP ha cinque cifre, per esempio 74024' })

export const zRegion = z.enum(ITALIAN_REGIONS, { error: 'Scegli la regione' })

/** The required fields of a residence the camp needs (the family data, the staff's sheet): all but the province. */
export const requiredResidence = {
  address: zRequiredText(200),
  city: zRequiredText(100),
  postalCode: zPostalCode.refine(value => value !== '', { error: 'Campo obbligatorio' }),
  region: zRegion,
}

/** A stored residence as the form holds it (IcResidenceFields): '' for an empty text, no region chosen. */
export function residenceForm(
  stored:
    | {
        address: string | null
        city: string | null
        postalCode: string | null
        province: string | null
        region: ItalianRegion | null
      }
    | null
    | undefined,
) {
  return {
    address: stored?.address ?? '',
    city: stored?.city ?? '',
    postalCode: stored?.postalCode ?? '',
    province: stored?.province ?? '',
    region: stored?.region ?? undefined,
  }
}

/** What a character of the codice fiscale is worth in an odd position (1st, 3rd…): digits as A to J. */
const FISCAL_ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23]
/** Letters, with the digits of an omocodia (L for 0 … V for 9) where the date and the place are. */
const FISCAL_SHAPE = /^[A-Z]{6}[\dLMNPQRSTUV]{2}[ABCDEHLMPRST][\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{3}[A-Z]$/

/** A codice fiscale of a person: its shape, and the last letter computed from the other fifteen. */
export function isFiscalCode(code: string): boolean {
  if (!FISCAL_SHAPE.test(code)) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    const char = code.charCodeAt(i)
    const index = char <= 57 ? char - 48 : char - 65
    sum += i % 2 === 0 ? FISCAL_ODD[index]! : index
  }
  return code[15] === String.fromCharCode(65 + (sum % 26))
}

/** A codice fiscale, required: spaces dropped, upper case. */
export const zFiscalCode = z
  .string()
  .transform(value => value.replace(/\s+/g, '').toUpperCase())
  .pipe(
    z
      .string()
      .min(1, { error: 'Campo obbligatorio' })
      .refine(isFiscalCode, { error: 'Codice fiscale non valido: controlla le 16 lettere e cifre' }),
  )
