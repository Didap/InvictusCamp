import type { NavigationMenuItem } from '@nuxt/ui'

/** The sections of the sidebar for the signed-in role. Every area page is listed here. */
export function useNav() {
  const { user } = useUserSession()
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
            { label: 'Documenti', icon: 'i-lucide-files', to: '/admin/documenti' },
            { label: 'Comunicazioni', icon: 'i-lucide-mail', to: '/admin/comunicazioni' },
          ],
          [{ label: 'Utenti', icon: 'i-lucide-users-round', to: '/admin/utenti' }],
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
        ]
      case 'staff':
        return [
          [
            { label: 'Home', icon: 'i-lucide-house', to: '/staff', exact: true },
            { label: 'Candidatura', icon: 'i-lucide-file-user', to: '/staff/candidatura' },
            { label: 'Disponibilità', icon: 'i-lucide-calendar-check', to: '/staff/disponibilita' },
            { label: 'Convocazioni', icon: 'i-lucide-bell-ring', to: '/staff/convocazioni' },
            { label: 'Sessioni', icon: 'i-lucide-calendar-days', to: '/staff/sessioni' },
            { label: 'Documenti', icon: 'i-lucide-folder-open', to: '/staff/documenti' },
          ],
        ]
      default:
        return []
    }
  })
}
