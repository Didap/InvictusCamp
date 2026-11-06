import type { UserRole, UserStatus } from '../utils/constants'

/** The user in the session cookie and in `useUserSession().user`. */
export interface SessionUser {
  id: string
  role: UserRole
  email: string
  firstName: string
  lastName: string
}

/** GET /api/account */
export interface AccountDto extends SessionUser {
  status: UserStatus
  phone: string | null
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

/** POST /api/auth/login */
export interface LoginResult {
  user: SessionUser
  /** The home of the role, or the page the user was trying to open. */
  redirectTo: string
}

/** GET /api/auth/invite?token= : who the invitation is for, before choosing a password. */
export interface InviteInfo {
  email: string
  firstName: string
  role: UserRole
}

/** Body of a 400 from parseBody / parseQuery. */
export interface ApiIssue {
  path: string
  message: string
}

/** A row of a paginated admin list. */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** A stored file as the interface sees it (download through GET /api/files/:id). */
export interface FileDto {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}
