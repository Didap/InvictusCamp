import { z } from 'zod'
import { PARTICIPATION_KINDS, SESSION_STATUSES } from '../utils/constants'
import { zIsoDay, zRequiredText, zText, zUuid } from './common'

/** Optional free text: empty becomes null. */
const zOptionalText = (max: number) =>
  zText(max)
    .nullish()
    .transform(value => value || null)

/** Optional day: an empty date field becomes null. */
const zOptionalDay = z
  .union([zIsoDay, z.literal('')])
  .nullish()
  .transform(value => value || null)

/** A required day: an empty date field says what is missing. */
const zRequiredDay = (what: string) =>
  z
    .string({ error: `Indica ${what}` })
    .min(1, { error: `Indica ${what}` })
    .pipe(zIsoDay)

const zCount = (label: string) =>
  z
    .number({ error: `Indica ${label}` })
    .int({ error: 'Serve un numero intero' })
    .min(0, { error: 'Non può essere negativo' })
    .max(500, { error: 'Al massimo 500' })

/** Create and edit a session (the form of /admin/sessioni/nuova and of the session page). */
export const sessionSchema = z
  .object({
    title: zRequiredText(120),
    description: zOptionalText(2000),
    location: zRequiredText(200),
    startDate: zRequiredDay('il primo giorno'),
    endDate: zRequiredDay('l’ultimo giorno'),
    familySlots: zCount('i posti per le famiglie'),
    staffNeeded: zCount('quante persone di staff servono'),
    responseDeadline: zOptionalDay,
    contractDocumentId: z
      .union([zUuid, z.literal('')])
      .nullish()
      .transform(value => value || null),
    notes: zOptionalText(5000),
  })
  .refine(value => value.endDate >= value.startDate, {
    path: ['endDate'],
    error: 'La fine non può venire prima dell’inizio',
  })
  .refine(value => !value.responseDeadline || value.responseDeadline <= value.startDate, {
    path: ['responseDeadline'],
    error: 'Il termine per rispondere deve venire prima dell’inizio della sessione',
  })
export type SessionInput = z.output<typeof sessionSchema>

/** GET /api/admin/sessions?status=draft,inviting&q= */
export const sessionListQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform(value =>
      (value ?? '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(SESSION_STATUSES))),
  q: z.string().trim().max(200).optional(),
})

/** POST /api/admin/sessions/:id/status */
export const sessionTransitionSchema = z.object({ to: z.enum(SESSION_STATUSES) })

/** POST /api/admin/sessions/:id/families (contract, docs/BUILD.md). */
export const addFamiliesSchema = z.object({
  familyIds: z
    .array(zUuid)
    .min(1, { error: 'Scegli almeno una famiglia' })
    .max(200, { error: 'Al massimo 200 famiglie alla volta' }),
  kind: z.enum(PARTICIPATION_KINDS),
})
export type AddFamiliesInput = z.output<typeof addFamiliesSchema>

/** GET /api/admin/sessions/:id/candidates?q= */
export const candidatesQuerySchema = z.object({ q: z.string().trim().max(200).optional() })

/** POST /api/admin/sessions/:id/call-reserve : the next reserve, or the chosen one. */
export const callReserveSchema = z.object({ participationId: zUuid.optional() })

/** PUT /api/admin/sessions/:id/reserves : every waiting reserve, in the new calling order. */
export const reorderReservesSchema = z.object({
  order: z.array(zUuid).min(1, { error: 'Nessuna riserva da ordinare' }).max(500),
})

/** The answer to an invitation, from the family or recorded by the administration. */
export const answerSchema = z.object({
  answer: z.enum(['confirmed', 'declined']),
  reason: zOptionalText(500),
})
export type AnswerInput = z.output<typeof answerSchema>
