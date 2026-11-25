import type { NavigationMenuItem } from '@nuxt/ui'
import { inStaffArea } from '#shared/utils/constants'

/** The guide of every role (docs/spec.md 3.15), last in the menu. */
const GUIDE = { label: 'Guida', icon: 'i-lucide-circle-help', to: '/guida' }

/** The sections of the sidebar for the signed-in role. Every area page is listed here. */
export function useNav() {
  const { user, session } = useUserSession()
  return computed<NavigationMenuItem[][]>(() => {
    switch (user.value?.role) {
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
            { label: 'Documenti', icon: 'i-lucide-files', to: '/admin/documenti' },
            { label: 'Comunicazioni', icon: 'i-lucide-mail', to: '/admin/comunicazioni' },
            { label: 'Feedback', icon: 'i-lucide-message-square-heart', to: '/admin/feedback' },
          ],
          [{ label: 'Utenti', icon: 'i-lucide-users-round', to: '/admin/utenti' }, GUIDE],
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
          [GUIDE],
        ]
      case 'staff': {
        const home = { label: 'Home', icon: 'i-lucide-house', to: '/staff', exact: true }
        // Before the approval the area is the home alone (spec 3.4).
        if (!inStaffArea(session.value?.staffStatus)) return [[home], [GUIDE]]
        return [
          [
            home,
            { label: 'Scheda personale', icon: 'i-lucide-id-card', to: '/staff/scheda' },
            { label: 'Disponibilità', icon: 'i-lucide-calendar-check', to: '/staff/disponibilita' },
            { label: 'Convocazioni', icon: 'i-lucide-bell-ring', to: '/staff/convocazioni' },
            { label: 'Sessioni', icon: 'i-lucide-calendar-days', to: '/staff/sessioni' },
            { label: 'Documenti', icon: 'i-lucide-folder-open', to: '/staff/documenti' },
          ],
          [GUIDE],
        ]
      }
      default:
        return []
    }
  })
}
