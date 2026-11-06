// The user kept in the sealed session cookie (nuxt-auth-utils). Keep it small: the server re-reads
// the account on every request (server/utils/auth.ts), so a role or status change takes effect at once.
import type { UserRole } from '../utils/constants'

declare module '#auth-utils' {
  interface User {
    id: string
    role: UserRole
    email: string
    firstName: string
    lastName: string
  }

  interface UserSession {
    /** ISO instant of the sign-in; sessions older than the last password change are refused. */
    loggedInAt: string
  }
}

export {}
