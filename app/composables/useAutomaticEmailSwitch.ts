import type { AutomaticEmailSwitch } from '#shared/types/automatic-emails'
import { automaticEmailDefinition, type AutomaticEmailKey } from '#shared/utils/automatic-emails'
import { plural } from '#shared/utils/format'

/**
 * Switches an automatic email on or off (Comunicazioni › Automatiche), asking first before switching it off.
 * `setActive` resolves the email's new state, or null when cancelled or refused.
 */
export function useAutomaticEmailSwitch() {
  const api = useApi()
  const confirm = useConfirm()
  const switching = ref<AutomaticEmailKey | null>(null)

  async function setActive(key: AutomaticEmailKey, active: boolean): Promise<AutomaticEmailSwitch | null> {
    const email = automaticEmailDefinition(key)
    if (!active) {
      const ok = await confirm({
        title: `Spegni «${email.label}»?`,
        description: `${email.trigger} Da adesso non parte più: nel registro la trovi come «Spenta».${email.manual ? ' Puoi sempre mandarla a mano.' : ''} Nessuna email parte adesso.`,
        confirmLabel: 'Spegni l’email',
      })
      if (!ok) return null
    }
    switching.value = key
    try {
      const url: string = `/api/admin/automatic-emails/${key}/active`
      const result = await api<AutomaticEmailSwitch>(url, { method: 'PUT', body: { active } })
      notifySuccess(
        active ? `«${email.label}» è accesa` : `«${email.label}» è spenta`,
        result.held
          ? `${plural(result.held, 'email in coda non partirà', 'email in coda non partiranno')}.`
          : undefined,
      )
      return result
    } catch (error) {
      notifyError(error)
      return null
    } finally {
      switching.value = null
    }
  }

  return { switching, setActive }
}
