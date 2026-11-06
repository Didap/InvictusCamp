import { z } from 'zod'
import { DOCUMENT_CATEGORIES } from '../utils/constants'
import { zIsoDay, zRequiredText, zText, zUuid } from './common'

/** The details of a document: the upload form (with the file) and the edit form. */
export const documentFieldsSchema = z.object({
  title: zRequiredText(200),
  category: z.enum(DOCUMENT_CATEGORIES, { error: 'Scegli una categoria' }),
  description: zText(2000).optional(),
  requiresSignature: z.boolean(),
  sessionId: zUuid.nullable().optional(),
})
export type DocumentFieldsInput = z.infer<typeof documentFieldsSchema>

/** The same fields as they arrive in the multipart upload (every value is a string). */
export const documentUploadFieldsSchema = documentFieldsSchema.extend({
  requiresSignature: z
    .enum(['true', 'false'], { error: 'Indica se il documento va firmato' })
    .transform(v => v === 'true'),
  sessionId: z
    .union([zUuid, z.literal('')])
    .optional()
    .transform(v => v || null),
})

/** PATCH /api/admin/documents/:id. "Da firmare" changes only while nobody has signed. */
export const documentUpdateSchema = documentFieldsSchema.extend({
  description: zText(2000).nullable().optional(),
})
export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>

/** POST /api/admin/documents/:id/archive */
export const documentArchiveSchema = z.object({ archived: z.boolean() })

export const assignTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('users'),
    userIds: z.array(zUuid).min(1, { error: 'Scegli almeno una persona' }).max(1000),
  }),
  z.object({ type: z.literal('all_families') }),
  z.object({ type: z.literal('all_staff') }),
  z.object({ type: z.literal('session_families'), sessionId: zUuid }),
  z.object({ type: z.literal('session_staff'), sessionId: zUuid }),
])

/** POST /api/admin/documents/:id/assign; `dryRun` only counts (the numbers of the confirmation). */
export const assignSchema = z.object({
  target: assignTargetSchema,
  dueDate: zIsoDay.nullable().optional(),
  dryRun: z.boolean().optional(),
})
export type AssignInput = z.infer<typeof assignSchema>

/** A checkbox that must be ticked before signing or confirming the reading. */
export const zReadConsent = z
  .boolean()
  .refine(value => value === true, { error: 'Spunta la casella per confermare di aver letto il documento' })

/** The typed name that signs the document. */
export const zSignedName = z
  .string()
  .trim()
  .min(3, { error: 'Scrivi il tuo nome e cognome' })
  .max(200, { error: 'Al massimo 200 caratteri' })

export const zSignatureCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { error: 'Il codice ha 6 cifre' })

/** POST /api/signatures/:id/sign */
export const signSchema = z.object({ consent: zReadConsent, name: zSignedName, code: zSignatureCode })
export type SignInput = z.infer<typeof signSchema>

/** POST /api/signatures/:id/read: a document to read, confirmed without a code. */
export const readConfirmSchema = z.object({ consent: zReadConsent })

/** GET /api/admin/documents */
export const documentListQuerySchema = z.object({ sessionId: zUuid.optional() })

/** GET /api/admin/signatures */
export const userSignaturesQuerySchema = z.object({ userId: zUuid })
