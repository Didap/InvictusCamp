import { z } from 'zod'

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
  .min(10, { error: 'Almeno 10 caratteri' })
  .max(200, { error: 'Al massimo 200 caratteri' })

export const zPersonName = z
  .string()
  .trim()
  .min(1, { error: 'Campo obbligatorio' })
  .max(100, { error: 'Al massimo 100 caratteri' })

export const zPhone = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+0-9 ().-]*$/, { error: 'Numero di telefono non valido' })

/** Free text, trimmed, with a maximum length. */
export const zText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Al massimo ${max} caratteri` })

/** Required free text. */
export const zRequiredText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: 'Campo obbligatorio' })
    .max(max, { error: `Al massimo ${max} caratteri` })

/** A day, YYYY-MM-DD. */
export const zIsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Data non valida' })

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
