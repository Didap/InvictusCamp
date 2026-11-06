// Accounts managed by the administration (/admin/utenti, docs/spec.md 3.1).
import { z } from 'zod'
import { USER_ROLES, USER_STATUSES } from '../utils/constants'
import { zEmail, zListQuery, zPersonName, zPhone, zText } from './common'

/** Who starts a staff account invited by the administration: to apply, or already approved. */
export const INVITE_STAFF_STATUSES = ['registered', 'approved'] as const

export const inviteUserSchema = z.object({
  role: z.enum(USER_ROLES, { error: 'Scegli il ruolo' }),
  firstName: zPersonName,
  lastName: zPersonName,
  email: zEmail,
  phone: zPhone.optional(),
  /** Families only; "Famiglia <cognome>" when empty. */
  familyName: zText(120).optional(),
  /** Staff only; `registered` when missing. */
  staffStatus: z.enum(INVITE_STAFF_STATUSES).optional(),
})
export type InviteUserInput = z.infer<typeof inviteUserSchema>

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(value => (value === '' || value === null ? undefined : value), schema.optional())

export const userListQuery = zListQuery.extend({
  role: optional(z.enum(USER_ROLES)),
  status: optional(z.enum(USER_STATUSES)),
  /** Comma-separated ids: the composer asks for the names of the people it was opened with. */
  ids: optional(
    z
      .string()
      .max(40 * 200)
      .transform(value => value.split(',').filter(Boolean))
      .pipe(z.array(z.uuid()).max(200)),
  ),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
})
export type UserListQuery = z.infer<typeof userListQuery>
