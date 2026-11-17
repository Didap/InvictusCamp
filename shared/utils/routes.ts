import type { StaffTeam, UserRole } from './constants'

/** Where each role lands after signing in, and the prefix of its pages. */
export const ROLE_HOME: Record<UserRole, string> = {
  admin: '/admin',
  family: '/famiglia',
  staff: '/staff',
}

/** Pages anyone can open. Signed-in users are sent home from the guest-only ones. */
export const PUBLIC_PATHS = [
  '/accedi',
  '/registrati',
  '/candidati',
  '/password-dimenticata',
  '/reimposta-password',
  '/invito',
  '/verifica-email',
  '/privacy',
] as const

/**
 * The name of each team in the addresses (docs/spec.md 3.4): the two lists of the administration,
 * `/admin/staff` and `/admin/v-team` with the pages of their people, and the application link
 * `/candidati?squadra=v-team`. The two pages of app/pages/admin/staff repeat them in their
 * `:team(staff|v-team)` path.
 */
export const TEAM_SLUG: Record<StaffTeam, string> = { staff: 'staff', volunteer: 'v-team' }

/** The team of a slug (`staff` or `v-team`), the staff for anything else. */
export function teamOfSlug(slug: unknown): StaffTeam {
  return slug === TEAM_SLUG.volunteer ? 'volunteer' : 'staff'
}

/** The list of a team, or the page of one of its people. */
export function teamPath(team: StaffTeam, userId?: string): string {
  return `/admin/${TEAM_SLUG[team]}${userId ? `/${userId}` : ''}`
}

export const GUEST_ONLY_PATHS = ['/accedi', '/registrati', '/candidati', '/password-dimenticata'] as const

/** The role whose area contains `path`, if the path belongs to a role area. */
export function areaRole(path: string): UserRole | null {
  for (const [role, prefix] of Object.entries(ROLE_HOME) as [UserRole, string][]) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return role
  }
  return null
}

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some(p => path === p || path.startsWith(`${p}/`))
}

/** A same-site path safe to redirect to after sign-in (never another origin). */
export function safeRedirect(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback
  }
  return value
}
