// The «Anagrafica» (docs/spec.md 3.16): contacts, their groups, the bulk import and the bulk actions.
import { z } from 'zod'
import { CONTACT_KINDS } from '../utils/constants'
import { blankAsMissing, zEmail, zListQuery, zRequiredText, zText, zUuid } from './common'

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankAsMissing, schema.optional())

/** A name can be missing: many lists hold only the address. */
const zContactName = zText(100)
const zKind = z.enum(CONTACT_KINDS, { error: 'Scegli il tipo' })
const zGroupIds = z.array(zUuid).max(100)

/** The most rows one import takes. */
export const CONTACT_IMPORT_MAX = 5000

export const contactInputSchema = z.object({
  kind: zKind,
  firstName: zContactName,
  lastName: zContactName,
  email: zEmail,
  groupIds: zGroupIds,
})
export type ContactInput = z.infer<typeof contactInputSchema>

/** The filters of the list, also used to act on every contact they find. `none`: in no group. */
export const contactFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  kind: optional(zKind),
  group: optional(z.union([zUuid, z.literal('none')])),
})
export type ContactFilter = z.infer<typeof contactFilterSchema>

export const contactListQuery = zListQuery.extend(contactFilterSchema.shape)
export type ContactListQuery = z.infer<typeof contactListQuery>

export const contactImportSchema = z.object({
  rows: z
    .array(z.object({ firstName: zContactName, lastName: zContactName, email: zEmail, kind: zKind.nullable() }))
    .min(1, { error: 'Nessun contatto da importare' })
    .max(CONTACT_IMPORT_MAX, { error: `Al massimo ${CONTACT_IMPORT_MAX} contatti alla volta` }),
  /** The type of the rows that have none. */
  kind: zKind,
  /** Every contact of the list joins these groups, the ones already in the registry too. */
  groupIds: zGroupIds,
  /** Contacts already in the registry take the type and the names of the row (a blank cell changes nothing). */
  update: z.boolean(),
})
export type ContactImportInput = z.infer<typeof contactImportSchema>

/** The contacts an action applies to: the ones ticked, or every one the filters find. */
const contactSelection = z.union([
  z.object({ ids: z.array(zUuid).min(1).max(CONTACT_IMPORT_MAX) }),
  z.object({ filter: contactFilterSchema }),
])

export const contactBulkSchema = z.discriminatedUnion('action', [
  z.object({ selection: contactSelection, action: z.literal('add_to_group'), groupId: zUuid }),
  z.object({ selection: contactSelection, action: z.literal('remove_from_group'), groupId: zUuid }),
  z.object({ selection: contactSelection, action: z.literal('set_kind'), kind: zKind }),
  z.object({ selection: contactSelection, action: z.literal('delete') }),
])
export type ContactBulkInput = z.infer<typeof contactBulkSchema>

export const contactGroupInputSchema = z.object({ name: zRequiredText(80) })
export type ContactGroupInput = z.infer<typeof contactGroupInputSchema>
