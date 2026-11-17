import type { Ref } from 'vue'

/**
 * Asks before leaving a page with unsaved changes: another page of the app (a confirm modal) or the browser
 * tab (its own prompt). `what` ends the sentence «Le modifiche … non ancora salvate andranno perse».
 */
export function useLeaveGuard(dirty: Readonly<Ref<boolean>>, what: string) {
  const confirm = useConfirm()
  async function canLeave() {
    if (!dirty.value) return true
    return confirm({
      title: 'Uscire senza salvare?',
      description: `Le modifiche ${what} non ancora salvate andranno perse.`,
      confirmLabel: 'Esci senza salvare',
      cancelLabel: 'Resta qui',
      danger: true,
    })
  }
  onBeforeRouteLeave(canLeave)
  onBeforeRouteUpdate(canLeave)
  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (dirty.value) event.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
}
