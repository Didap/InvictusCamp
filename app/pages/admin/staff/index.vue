<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SessionListItem } from '#shared/types/sessions'
import type { StaffListItem } from '#shared/types/staff'
import type { StaffRole } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDay, formatDayRange, fullName } from '#shared/utils/format'

// Staff of the camp: applications to review, approved staff, everyone (spec 3.4). Tab in the query string.
const route = useRoute()
const router = useRouter()
const api = useApi()
const confirm = useConfirm()
const { label, options } = useEnums()
// Coverage of a session (P1): with a session chosen, each person carries how their availability covers it.
const sessionId = ref('none')
const coverage = ref<'some' | 'full'>('some')
const [{ data, refresh }, { data: sessions }] = await Promise.all([
  useApiFetch<StaffListItem[]>('/api/admin/staff', {
    query: computed(() => (sessionId.value === 'none' ? {} : { sessionId: sessionId.value })),
  }),
  useApiFetch<SessionListItem[]>('/api/admin/sessions', { query: { status: 'draft,inviting,confirmed' } }),
])
const staff = computed(() => data.value ?? [])
const sessionItems = computed(() => [
  { label: 'Nessuna sessione', value: 'none' },
  ...(sessions.value ?? []).map(session => ({
    label: `${session.title} (${formatDayRange(session.startDate, session.endDate)})`,
    value: session.id,
  })),
])
const coverageItems = [
  { label: 'Almeno qualche giorno', value: 'some' },
  { label: 'Tutte le date', value: 'full' },
]
// Applications to review have no availability yet: the filter applies to the other tabs.
const bySession = computed(() => sessionId.value !== 'none' && tab.value !== 'review')

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
  { label: 'Staff approvato', value: 'approved', badge: counts.value.approved },
  { label: 'Tutti', value: 'all', badge: counts.value.all },
])

const q = ref('')
const role = ref<StaffRole | 'all'>('all')
const roleItems = computed(() => [
  { label: 'Tutti i ruoli', value: 'all' },
  ...options('staffRole').map(option => ({ label: option.label, value: option.value })),
])
const filtered = computed(() => Boolean(q.value.trim()) || role.value !== 'all' || bySession.value)
function resetFilters() {
  q.value = ''
  role.value = 'all'
  sessionId.value = 'none'
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
    if (bySession.value && (coverage.value === 'full' ? person.coverage !== 'full' : person.coverage === 'none')) {
      return false
    }
    return !term || plain(`${person.firstName} ${person.lastName} ${person.email} ${person.city ?? ''}`).includes(term)
  })
  // Applications wait in the order they arrived; with a session, full coverage comes first.
  if (tab.value === 'review') return [...list].sort((a, b) => (a.appliedAt ?? '').localeCompare(b.appliedAt ?? ''))
  return bySession.value
    ? [...list].sort((a, b) => Number(b.coverage === 'full') - Number(a.coverage === 'full'))
    : list
})

const rolesOf = (person: StaffListItem) => person.roles.map(r => label('staffRole', r)).join(', ') || 'Non indicati'
/** The day (in Italy) an application was sent. */
const appliedOn = (person: StaffListItem) => (person.appliedAt ? formatDay(todayIso(new Date(person.appliedAt))) : '')
const availabilityOf = (person: StaffListItem) =>
  person.nextAvailability
    ? formatDayRange(person.nextAvailability.startDate, person.nextAvailability.endDate)
    : 'Nessun periodo'

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
  { id: 'status', header: 'Stato' },
  ...(bySession.value ? [] : [{ accessorKey: 'appliedAt', header: sortable('Candidatura') }]),
  {
    id: 'availability',
    accessorFn: row => row.nextAvailability?.startDate ?? '9999-12-31',
    header: sortable('Disponibilità'),
  },
  ...(bySession.value ? [{ id: 'coverage', header: 'Nella sessione' }] : []),
])
</script>

<template>
  <IcPage title="Staff" width="wide">
    <div class="space-y-5">
      <UTabs v-model="tab" :items="tabItems" :content="false" variant="link" class="w-full overflow-x-auto" />

      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Cerca" class="w-full sm:w-72">
          <UInput v-model="q" icon="i-lucide-search" placeholder="Nome, email o città" class="w-full" />
        </UFormField>
        <UFormField label="Ruolo" class="w-full sm:w-60">
          <USelect v-model="role" :items="roleItems" class="w-full" />
        </UFormField>
        <UFormField v-if="tab !== 'review'" label="Disponibili per la sessione" class="w-full sm:w-80">
          <USelect v-model="sessionId" :items="sessionItems" class="w-full" />
        </UFormField>
        <UFormField v-if="bySession" label="Copertura delle date" class="w-full sm:w-56">
          <USelect v-model="coverage" :items="coverageItems" class="w-full" />
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
        description="Cambia le parole cercate o il ruolo."
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
            <ULink :to="`/admin/staff/${row.original.userId}`" class="font-semibold text-primary hover:underline">
              {{ fullName(row.original) }}
            </ULink>
          </template>
          <template #roles-cell="{ row }">
            <span class="whitespace-normal">{{ rolesOf(row.original) }}</span>
          </template>
          <template #city-cell="{ row }">
            <span :class="row.original.city ? '' : 'text-dimmed'">{{ row.original.city ?? 'Non indicata' }}</span>
          </template>
          <template #status-cell="{ row }">
            <div class="flex flex-wrap gap-1.5">
              <IcStatusBadge kind="staffStatus" :value="row.original.status" />
              <IcStatusBadge
                v-if="row.original.accountStatus !== 'active'"
                kind="userStatus"
                :value="row.original.accountStatus"
              />
            </div>
          </template>
          <template #appliedAt-cell="{ row }">
            <span v-if="row.original.appliedAt" class="tabular-nums">{{ appliedOn(row.original) }}</span>
            <span v-else class="text-dimmed">Non inviata</span>
          </template>
          <template #coverage-cell="{ row }">
            <StaffCoverageBadge v-if="row.original.coverage" :coverage="row.original.coverage" />
          </template>
          <template #availability-cell="{ row }">
            <span :class="row.original.nextAvailability ? 'tabular-nums' : 'text-dimmed'">
              {{ availabilityOf(row.original) }}
            </span>
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
                <ULink :to="`/admin/staff/${person.userId}`" class="font-semibold text-primary hover:underline">
                  {{ fullName(person) }}
                </ULink>
                <div class="flex flex-wrap gap-1.5">
                  <IcStatusBadge kind="staffStatus" :value="person.status" />
                  <StaffCoverageBadge v-if="bySession && person.coverage" :coverage="person.coverage" />
                </div>
              </div>
              <p class="text-sm">
                {{ rolesOf(person) }}<span v-if="person.city" class="text-muted"> · {{ person.city }}</span>
              </p>
              <p class="text-sm text-muted">
                <template v-if="tab === 'review' && person.appliedAt">Inviata il {{ appliedOn(person) }}</template>
                <template v-else>Prossima disponibilità: {{ availabilityOf(person) }}</template>
              </p>
            </div>
          </li>
        </ul>
      </template>
    </div>
  </IcPage>
</template>
