<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SessionListItem } from '#shared/types/sessions'
import { STAFF_AGE_FILTERS } from '#shared/schemas/staff'
import type { StaffListItem } from '#shared/types/staff'
import { ageOn, todayIso } from '#shared/utils/dates'
import { formatAge, formatDayRange, fullName } from '#shared/utils/format'
import { teamOfSegment, teamPath } from '#shared/utils/routes'

// The staff, or the v-team (/admin/v-team): two separate lists of the same page (spec 3.4). Applications to
// review, approved people, everyone; tab in the query string. The table shows who people are (roles, city,
// age) and the «Valutazione»; status, application date and availability are on the page of each person.
definePageMeta({ path: '/admin/:team(staff|v-team)' })
const route = useRoute()
const team = computed(() => teamOfSegment(route.params.team))
const { label } = useEnums()
const router = useRouter()
const api = useApi()
const confirm = useConfirm()
const { roleFilterItems, roleList, tagsOf } = useStaffLabels()
// Availability (P1): anyone, at least one session not started yet, none, or a session (who can come to it).
const availability = ref('all')
const SESSION_FREE = ['all', 'any', 'none']
const sessionId = computed(() => (SESSION_FREE.includes(availability.value) ? null : availability.value))
const [{ data, refresh }, { data: sessions }] = await Promise.all([
  useApiFetch<StaffListItem[]>('/api/admin/staff', {
    query: computed(() => ({ team: team.value, ...(sessionId.value ? { sessionId: sessionId.value } : {}) })),
  }),
  useApiFetch<SessionListItem[]>('/api/admin/sessions', { query: { status: 'draft,inviting,confirmed' } }),
])
const staff = computed(() => data.value ?? [])
const availabilityItems = computed(() => [
  { label: 'Tutte le persone', value: 'all' },
  { label: 'Almeno una sessione', value: 'any' },
  { label: 'Nessuna sessione', value: 'none' },
  ...(sessions.value ?? []).map(session => ({
    label: `${session.title} (${formatDayRange(session.startDate, session.endDate)})`,
    value: session.id,
  })),
])
// Applications to review have no availability yet: the filter applies to the other tabs.
const byAvailability = computed(() => availability.value !== 'all' && tab.value !== 'review')

const TABS = ['review', 'approved', 'all'] as const
type Tab = (typeof TABS)[number]
const counts = computed(() => ({
  review: staff.value.filter(person => person.status === 'applied').length,
  approved: staff.value.filter(person => person.status === 'approved').length,
  all: staff.value.length,
}))
const tab = computed<Tab>({
  get: () => {
    const value = route.query.tab as Tab
    if (TABS.includes(value)) return value
    return counts.value.review ? 'review' : 'approved'
  },
  set: value => {
    router.replace({ query: { ...route.query, tab: value } })
  },
})
const tabItems = computed(() => [
  { label: 'Da valutare', value: 'review', badge: counts.value.review || undefined },
  { label: `${label('staffTeam', team.value)} approvato`, value: 'approved', badge: counts.value.approved },
  { label: 'Tutti', value: 'all', badge: counts.value.all },
])

const q = ref('')
const role = ref('all')
const age = ref('all')
const ageItems = [
  { label: 'Tutte le età', value: 'all' },
  ...STAFF_AGE_FILTERS.map(filter => ({ label: filter.label, value: filter.value })),
]
const filtered = computed(
  () => Boolean(q.value.trim()) || role.value !== 'all' || age.value !== 'all' || byAvailability.value,
)
function resetFilters() {
  q.value = ''
  role.value = 'all'
  age.value = 'all'
  availability.value = 'all'
}

const today = todayIso()
const ageOf = (person: StaffListItem) => (person.birthDate ? ageOn(person.birthDate, today) : null)
function inAgeRange(person: StaffListItem): boolean {
  const range = STAFF_AGE_FILTERS.find(filter => filter.value === age.value)
  const years = ageOf(person)
  return !range || (years !== null && years >= range.min && years <= range.max)
}
function hasAvailability(person: StaffListItem): boolean {
  if (!byAvailability.value) return true
  if (availability.value === 'any') return person.availableSessions > 0
  if (availability.value === 'none') return person.availableSessions === 0
  return Boolean(person.available)
}

const plain = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
const rows = computed(() => {
  const term = plain(q.value.trim())
  const list = staff.value.filter(person => {
    if (tab.value === 'review' && person.status !== 'applied') return false
    if (tab.value === 'approved' && person.status !== 'approved') return false
    if (role.value !== 'all' && !person.roles.includes(role.value)) return false
    if (!inAgeRange(person) || !hasAvailability(person)) return false
    return !term || plain(`${person.firstName} ${person.lastName} ${person.email} ${person.city ?? ''}`).includes(term)
  })
  // Applications wait in the order they arrived.
  if (tab.value === 'review') return [...list].sort((a, b) => (a.appliedAt ?? '').localeCompare(b.appliedAt ?? ''))
  return list
})

const rolesOf = (person: StaffListItem) => roleList(person.roles, 'Non indicati')
const labelsOpen = ref(false)

// Bulk approval (Da valutare): no email leaves, the outcome is communicated person by person.
const selection = ref<Record<string, boolean>>({})
const selectedIds = computed(() =>
  Object.keys(selection.value).filter(id => selection.value[id] && rows.value.some(row => row.userId === id)),
)
watch(tab, () => {
  selection.value = {}
})
function toggle(id: string, value: boolean) {
  selection.value = { ...selection.value, [id]: value }
}
const allSelected = computed<boolean | 'indeterminate'>(() =>
  !selectedIds.value.length ? false : selectedIds.value.length === rows.value.length ? true : 'indeterminate',
)
function toggleAll(value: boolean) {
  selection.value = value ? Object.fromEntries(rows.value.map(row => [row.userId, true])) : {}
}
const approving = ref(false)
async function approveSelected() {
  const count = selectedIds.value.length
  const ok = await confirm({
    title: count === 1 ? 'Approvi la candidatura selezionata?' : `Approvi ${count} candidature?`,
    description:
      'Le persone potranno indicare la disponibilità ed essere convocate. Nessuna email parte adesso: comunichi l’esito dalla scheda di ciascuno, quando vuoi.',
    confirmLabel: count === 1 ? 'Approva' : `Approva ${count} candidature`,
  })
  if (!ok) return
  approving.value = true
  try {
    const result = await api<{ approved: number; skipped: number }>('/api/admin/staff/approve', {
      method: 'POST',
      body: { userIds: selectedIds.value },
    })
    notifySuccess(
      result.approved === 1 ? 'Candidatura approvata' : `${result.approved} candidature approvate`,
      'Ricordati di comunicare l’esito dalla scheda di ogni persona.',
    )
    selection.value = {}
    await refresh()
  } catch (error) {
    notifyError(error)
  } finally {
    approving.value = false
  }
}

const UButton = resolveComponent('UButton')
function sortable(title: string) {
  return ({
    column,
  }: {
    column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (desc?: boolean) => void }
  }) => {
    const sorted = column.getIsSorted()
    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label: title,
      icon:
        sorted === 'asc'
          ? 'i-lucide-arrow-up-narrow-wide'
          : sorted === 'desc'
            ? 'i-lucide-arrow-down-wide-narrow'
            : 'i-lucide-arrow-up-down',
      class: '-mx-2.5 font-semibold',
      'aria-label': `Ordina per ${title.toLowerCase()}`,
      onClick: () => column.toggleSorting(sorted === 'asc'),
    })
  }
}
const columns = computed<TableColumn<StaffListItem>[]>(() => [
  ...(tab.value === 'review' && rows.value.length ? [{ id: 'select' }] : []),
  { id: 'name', accessorFn: row => `${row.lastName} ${row.firstName}`, header: sortable('Nome') },
  { id: 'roles', header: 'Ruoli' },
  { accessorKey: 'city', header: sortable('Città') },
  { id: 'age', accessorFn: row => ageOf(row) ?? -1, header: sortable('Età') },
  { id: 'tags', header: 'Valutazione' },
])
</script>

<template>
  <IcPage :title="label('staffTeam', team)" width="wide">
    <template #actions>
      <UButton
        icon="i-lucide-tags"
        label="Ruoli e valutazione"
        color="neutral"
        variant="outline"
        @click="labelsOpen = true"
      />
    </template>
    <StaffLabelsModal v-model:open="labelsOpen" @deleted="refresh" />

    <div class="space-y-5">
      <UTabs v-model="tab" :items="tabItems" :content="false" variant="link" class="w-full overflow-x-auto" />

      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Cerca" class="w-full sm:w-72">
          <UInput v-model="q" icon="i-lucide-search" placeholder="Nome, email o città" class="w-full" />
        </UFormField>
        <UFormField label="Ruolo" class="w-full sm:w-60">
          <USelect v-model="role" :items="roleFilterItems" class="w-full" />
        </UFormField>
        <UFormField label="Età" class="w-full sm:w-44">
          <USelect v-model="age" :items="ageItems" class="w-full" />
        </UFormField>
        <UFormField v-if="tab !== 'review'" label="Disponibilità" class="w-full sm:w-80">
          <USelect v-model="availability" :items="availabilityItems" class="w-full" />
        </UFormField>
        <UButton
          class="pointer-coarse:min-h-11"
          v-if="filtered"
          label="Azzera i filtri"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          @click="resetFilters"
        />
        <UButton
          v-if="tab === 'review' && selectedIds.length"
          class="pointer-coarse:min-h-11 sm:ms-auto"
          icon="i-lucide-badge-check"
          :label="selectedIds.length === 1 ? 'Approva la selezionata' : `Approva le ${selectedIds.length} selezionate`"
          :loading="approving"
          @click="approveSelected"
        />
      </div>

      <UEmpty
        v-if="!rows.length && filtered"
        icon="i-lucide-search-x"
        title="Nessuna persona corrisponde alla ricerca"
        description="Cambia le parole cercate o i filtri."
        :actions="[{ label: 'Azzera i filtri', color: 'neutral', variant: 'outline', onClick: resetFilters }]"
      />
      <UEmpty
        v-else-if="!rows.length && tab === 'review'"
        icon="i-lucide-inbox"
        title="Nessuna candidatura da valutare"
        description="Quando qualcuno completa e invia la candidatura dalla sua area, la trovi qui. L’esito parte solo quando lo comunichi tu."
      />
      <UEmpty
        v-else-if="!rows.length"
        icon="i-lucide-users"
        title="Nessuna persona in questo elenco"
        description="Le persone approvate possono indicare la disponibilità ed essere convocate alle sessioni. Approvale dalla scheda Da valutare."
      />

      <template v-else>
        <UTable :data="rows" :columns="columns" :get-row-id="row => row.userId" class="hidden lg:block">
          <template #select-header>
            <UCheckbox
              :model-value="allSelected"
              aria-label="Seleziona tutte le candidature"
              @update:model-value="value => toggleAll(value === true)"
            />
          </template>
          <template #select-cell="{ row }">
            <UCheckbox
              :model-value="Boolean(selection[row.original.userId])"
              :aria-label="`Seleziona ${fullName(row.original)}`"
              @update:model-value="value => toggle(row.original.userId, value === true)"
            />
          </template>
          <template #name-cell="{ row }">
            <ULink :to="teamPath(team, row.original.userId)" class="font-semibold text-primary hover:underline">
              {{ fullName(row.original) }}
            </ULink>
          </template>
          <template #roles-cell="{ row }">
            <span class="whitespace-normal">{{ rolesOf(row.original) }}</span>
          </template>
          <template #city-cell="{ row }">
            <span :class="row.original.city ? '' : 'text-dimmed'">{{ row.original.city ?? 'Non indicata' }}</span>
          </template>
          <template #age-cell="{ row }">
            <span v-if="row.original.birthDate" class="tabular-nums">{{ ageOf(row.original) }}</span>
            <span v-else class="text-dimmed">Non indicata</span>
          </template>
          <template #tags-cell="{ row }">
            <StaffTags :tags="tagsOf(row.original.tags)" empty="Nessuna" />
          </template>
        </UTable>

        <ul class="divide-y divide-default rounded-lg border border-default bg-elevated lg:hidden">
          <li v-for="person in rows" :key="person.userId" class="flex gap-3 p-4">
            <UCheckbox
              v-if="tab === 'review'"
              :model-value="Boolean(selection[person.userId])"
              :aria-label="`Seleziona ${fullName(person)}`"
              class="pt-1"
              @update:model-value="value => toggle(person.userId, value === true)"
            />
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <ULink :to="teamPath(team, person.userId)" class="font-semibold text-primary hover:underline">
                  {{ fullName(person) }}
                </ULink>
              </div>
              <p class="text-sm">
                {{ rolesOf(person) }}<span v-if="person.city" class="text-muted"> · {{ person.city }}</span
                ><span v-if="person.birthDate" class="text-muted"> · {{ formatAge(ageOf(person)!) }}</span>
              </p>
              <StaffTags :tags="tagsOf(person.tags)" />
            </div>
          </li>
        </ul>
      </template>
    </div>
  </IcPage>
</template>
