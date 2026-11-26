// Accounts managed by the administration (/admin/utenti, docs/spec.md 3.1).
import { z } from 'zod'
import { USER_ROLES, USER_STATUSES } from '../utils/constants'
import { zEmail, zListQuery, zOptional, zPersonName, zPhone, zText } from './common'

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

/** The columns /admin/utenti sorts by, on the server because the list comes a page at a time. */
export const USER_LIST_SORTS = ['name', 'role', 'status', 'lastLogin'] as const
export type UserListSort = (typeof USER_LIST_SORTS)[number]

export const userListQuery = zListQuery.extend({
  role: zOptional(z.enum(USER_ROLES)),
  status: zOptional(z.enum(USER_STATUSES)),
  /** By name (surname first) when missing. */
  sort: zOptional(z.enum(USER_LIST_SORTS)),
  order: zOptional(z.enum(['asc', 'desc'])),
  /** Comma-separated ids: the composer asks for the names of the people it was opened with. */
  ids: zOptional(
    z
      .string()
      .max(40 * 200)
      .transform(value => value.split(',').filter(Boolean))
      .pipe(z.array(z.uuid()).max(200)),
  ),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
})
export type UserListQuery = z.infer<typeof userListQuery>
