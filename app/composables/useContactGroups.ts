import type { ContactGroupItem } from '#shared/types/contacts'

/**
 * The groups of the «Anagrafica» (spec 3.16): one request shared by the page and its modals, refreshed after a
 * change. `create` adds a group from a picker and returns its id.
 */
export function useContactGroups() {
  const api = useApi()
  const { data, refresh } = useApiFetch<ContactGroupItem[]>('/api/admin/contact-groups', {
    key: 'contact-groups',
    dedupe: 'defer',
  })
  const groups = computed(() => data.value ?? [])
  const groupName = (id: string) => groups.value.find(group => group.id === id)?.name ?? null
  async function create(name: string): Promise<string | null> {
    try {
      const { id } = await api<{ id: string }>('/api/admin/contact-groups', { method: 'POST', body: { name } })
      await refresh()
      notifySuccess('Gruppo creato', name)
      return id
    } catch (error) {
      notifyError(error)
      return null
    }
  }
  return { groups, groupName, create, refresh }
}
