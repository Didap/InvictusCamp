import type { StaffLabels, StaffTagDto } from '#shared/types/staff'

/**
 * The roles of staff and v-team and the tags of the «Valutazione» (admin pages, spec 3.4): one request shared
 * by every component that asks, refreshed by the editor after a change.
 */
export function useStaffLabels() {
  // `defer`: a component mounted while the request is on its way waits for it instead of sending another.
  const { data, refresh } = useApiFetch<StaffLabels>('/api/admin/staff/labels', {
    key: 'staff-labels',
    dedupe: 'defer',
  })
  const roles = computed(() => data.value?.roles ?? [])
  const tags = computed(() => data.value?.tags ?? [])
  const roleItems = computed(() => roles.value.map(role => ({ label: role.name, value: role.id })))
  const roleFilterItems = computed(() => [{ label: 'Tutti i ruoli', value: 'all' }, ...roleItems.value])
  const roleName = (id: string | null) => (id && roles.value.find(role => role.id === id)?.name) || null
  /** "Coordinatore, Altro", or `empty` when the person has none. */
  const roleList = (ids: readonly string[], empty: string) => ids.flatMap(id => roleName(id) ?? []).join(', ') || empty
  const tagsOf = (ids: readonly string[]): StaffTagDto[] =>
    ids.flatMap(id => tags.value.find(tag => tag.id === id) ?? [])
  return { roles, tags, roleItems, roleFilterItems, roleName, roleList, tagsOf, refresh }
}
