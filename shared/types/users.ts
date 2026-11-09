// DTOs of the accounts page (/admin/utenti). Never the users row itself: it holds the password hash.
import type { StaffStatus, UserRole, UserStatus } from '../utils/constants'

/** A row of GET /api/admin/users. */
export interface UserListItem {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  role: UserRole
  status: UserStatus
  /** Self-registered accounts sign in only after confirming the address. */
  emailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
  familyId: string | null
  familyName: string | null
  staffStatus: StaffStatus | null
  /** Invited accounts: until when the last invitation link works (null when none does). */
  inviteExpiresAt: string | null
}

/** POST /api/admin/users and the other account actions. */
export interface UserActionResult {
  user: UserListItem
  /** Emails that left with the action. */
  emails: number
}
