import type { UserRole } from './constants'

/** An item of the sidebar menu (useNav) or of the account menu (layouts/default.vue). */
export interface NavItem {
  label: string
  icon: string
  to: string
  exact?: boolean
}

/** The guide of every role (docs/spec.md 3.15), last in the menu. */
export const GUIDE_ITEM: NavItem = { label: 'Guida', icon: 'i-lucide-circle-help', to: '/guida' }

/** The account page, in the menu under the name for every role. */
export const ACCOUNT_ITEM: NavItem = { label: 'Il mio account', icon: 'i-lucide-user-cog', to: '/account' }

/** The pages the guide describes (docs/spec.md 3.15): the menu without the guide itself, then the account. */
export function guidePages(nav: NavItem[][]): NavItem[] {
  return [...nav.flat().filter(item => item.to !== GUIDE_ITEM.to), ACCOUNT_ITEM]
}

/**
 * The sections of the sidebar for a role. Every area page is listed here. Staff not approved yet
 * (`staffInArea` false) have the home alone (spec 3.4), and the guide.
 */
export function navFor(role: UserRole, staffInArea: boolean): NavItem[][] {
  switch (role) {
    case 'admin':
      return [
        [
          { label: 'Panoramica', icon: 'i-lucide-layout-dashboard', to: '/admin', exact: true },
          { label: 'Sessioni', icon: 'i-lucide-calendar-range', to: '/admin/sessioni' },
          { label: 'Programma', icon: 'i-lucide-calendar-clock', to: '/admin/programma' },
          { label: 'Alloggi', icon: 'i-lucide-bed-double', to: '/admin/alloggi' },
          { label: 'Famiglie', icon: 'i-lucide-heart-handshake', to: '/admin/famiglie' },
          { label: 'Staff', icon: 'i-lucide-id-card', to: '/admin/staff' },
          { label: 'V-team', icon: 'i-lucide-hand-heart', to: '/admin/v-team' },
          { label: 'Formazione', icon: 'i-lucide-graduation-cap', to: '/admin/formazione' },
          { label: 'Documenti', icon: 'i-lucide-files', to: '/admin/documenti' },
          { label: 'Comunicazioni', icon: 'i-lucide-mail', to: '/admin/comunicazioni' },
          { label: 'Anagrafica', icon: 'i-lucide-book-user', to: '/admin/anagrafica' },
          { label: 'Feedback', icon: 'i-lucide-message-square-heart', to: '/admin/feedback' },
        ],
        [{ label: 'Utenti', icon: 'i-lucide-users-round', to: '/admin/utenti' }, GUIDE_ITEM],
      ]
    case 'family':
      return [
        [
          { label: 'Home', icon: 'i-lucide-house', to: '/famiglia', exact: true },
          { label: 'Sessioni', icon: 'i-lucide-calendar-days', to: '/famiglia/sessioni' },
          { label: 'Dati della famiglia', icon: 'i-lucide-clipboard-list', to: '/famiglia/profilo' },
          { label: 'Componenti', icon: 'i-lucide-users', to: '/famiglia/membri' },
          { label: 'Documenti', icon: 'i-lucide-folder-open', to: '/famiglia/documenti' },
        ],
        [GUIDE_ITEM],
      ]
    case 'staff': {
      const home: NavItem = { label: 'Home', icon: 'i-lucide-house', to: '/staff', exact: true }
      if (!staffInArea) return [[home], [GUIDE_ITEM]]
      return [
        [
          home,
          { label: 'Scheda personale', icon: 'i-lucide-id-card', to: '/staff/scheda' },
          { label: 'Disponibilità', icon: 'i-lucide-calendar-check', to: '/staff/disponibilita' },
          { label: 'Convocazioni', icon: 'i-lucide-bell-ring', to: '/staff/convocazioni' },
          { label: 'Sessioni', icon: 'i-lucide-calendar-days', to: '/staff/sessioni' },
          { label: 'Documenti', icon: 'i-lucide-folder-open', to: '/staff/documenti' },
          { label: 'Formazione', icon: 'i-lucide-graduation-cap', to: '/staff/formazione' },
          { label: 'Risorse utili', icon: 'i-lucide-library', to: '/staff/risorse' },
        ],
        [GUIDE_ITEM],
      ]
    }
  }
}
