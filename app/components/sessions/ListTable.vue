<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { SessionCreated, SessionListItem } from '#shared/types/sessions'
import { DEFAULT_LOCATION } from '#shared/utils/constants'
import { formatDay, formatDayRange } from '#shared/utils/format'

// The sessions of /admin/sessioni: a sortable table on desktop, a list of rows on phones.
const props = defineProps<{ sessions: SessionListItem[]; caption: string }>()

const api = useApi()
const UButton = resolveComponent('UButton')
const sorting = ref<{ id: string; desc: boolean }[]>([])

/** The part of a TanStack column a sortable header needs. */
interface SortableColumn {
  getIsSorted: () => false | 'asc' | 'desc'
  toggleSorting: (desc?: boolean) => void
}

function sortable(label: string) {
  return ({ column }: { column: SortableColumn }) => {
    const sorted = column.getIsSorted()
    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label,
      trailingIcon:
        sorted === 'asc'
          ? 'i-lucide-arrow-up-narrow-wide'
          : sorted === 'desc'
            ? 'i-lucide-arrow-down-wide-narrow'
            : 'i-lucide-arrow-up-down',
      class: '-mx-2.5 font-semibold',
      'aria-label': `Ordina per ${label.toLowerCase()}`,
      onClick: () => column.toggleSorting(sorted === 'asc'),
    })
  }
}

const columns: TableColumn<SessionListItem>[] = [
  { accessorKey: 'title', header: sortable('Sessione') },
  { accessorKey: 'startDate', header: sortable('Date') },
  { accessorKey: 'status', header: 'Stato' },
  { id: 'places', header: 'Posti' },
  { id: 'reserves', header: 'Riserve' },
  { id: 'staff', header: 'Staff' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Azioni') },
]

const link = (session: SessionListItem, tab?: string) => `/admin/sessioni/${session.id}${tab ? `?tab=${tab}` : ''}`

async function duplicate(session: SessionListItem) {
  try {
    const { id } = await api<SessionCreated>(`/api/admin/sessions/${session.id}/duplicate`, { method: 'POST' })
    notifySuccess('Sessione duplicata', 'La copia è in bozza, senza famiglie né staff: controlla le date.')
    await navigateTo(`/admin/sessioni/${id}`)
  } catch (error) {
    notifyError(error, 'Sessione non duplicata')
  }
}

function actions(session: SessionListItem): DropdownMenuItem[][] {
  return [
    [
      { label: 'Apri la sessione', icon: 'i-lucide-arrow-right', to: link(session) },
      { label: 'Famiglie', icon: 'i-lucide-heart-handshake', to: link(session, 'famiglie') },
      { label: 'Staff', icon: 'i-lucide-id-card', to: link(session, 'staff') },
    ],
    [{ label: 'Duplica', icon: 'i-lucide-copy', onSelect: () => duplicate(session) }],
  ]
}

const rows = computed(() => props.sessions)
</script>

<template>
  <div>
    <UTable
      v-model:sorting="sorting"
      :data="rows"
      :columns="columns"
      :caption="caption"
      class="hidden rounded-lg border border-default bg-elevated md:block"
    >
      <template #title-cell="{ row }">
        <NuxtLink
          :to="link(row.original)"
          class="font-semibold text-highlighted hover:underline focus-visible:underline"
        >
          {{ row.original.title }}
        </NuxtLink>
        <p v-if="row.original.location !== DEFAULT_LOCATION" class="text-sm text-muted">
          {{ row.original.location }}
        </p>
      </template>
      <template #startDate-cell="{ row }">
        <span class="whitespace-nowrap">{{ formatDayRange(row.original.startDate, row.original.endDate) }}</span>
        <p v-if="row.original.status === 'inviting' && row.original.responseDeadline" class="text-sm text-muted">
          Risposte entro il {{ formatDay(row.original.responseDeadline) }}
        </p>
      </template>
      <template #status-cell="{ row }">
        <IcStatusBadge kind="sessionStatus" :value="row.original.status" />
      </template>
      <template #places-cell="{ row }">
        <span class="font-semibold text-highlighted tabular-nums">
          {{ row.original.slots.held }}/{{ row.original.slots.total }}
        </span>
        <p class="text-sm text-muted">{{ row.original.slots.confirmed }} confermate</p>
      </template>
      <template #reserves-cell="{ row }">
        <span class="tabular-nums">{{ row.original.slots.reserves }}</span>
        <span class="sr-only">in attesa</span>
      </template>
      <template #staff-cell="{ row }">
        <span class="font-semibold text-highlighted tabular-nums">
          {{ row.original.staff.confirmed }}/{{ row.original.staff.needed }}
        </span>
        <p class="text-sm text-muted">confermati</p>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end">
          <UDropdownMenu :items="actions(row.original)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :aria-label="`Azioni per ${row.original.title}`"
            />
          </UDropdownMenu>
        </div>
      </template>
    </UTable>

    <ul
      class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-elevated md:hidden"
      :aria-label="caption"
    >
      <li v-for="session in sessions" :key="session.id">
        <NuxtLink
          :to="link(session)"
          class="flex flex-col gap-2 p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <span class="flex items-start justify-between gap-3">
            <span class="font-semibold text-highlighted">{{ session.title }}</span>
            <IcStatusBadge kind="sessionStatus" :value="session.status" size="sm" />
          </span>
          <span class="text-sm text-muted">{{ formatDayRange(session.startDate, session.endDate) }}</span>
          <span class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              Posti <strong class="tabular-nums">{{ session.slots.held }}/{{ session.slots.total }}</strong>
            </span>
            <span>
              Confermate <strong class="tabular-nums">{{ session.slots.confirmed }}</strong>
            </span>
            <span>
              Riserve <strong class="tabular-nums">{{ session.slots.reserves }}</strong>
            </span>
            <span>
              Staff <strong class="tabular-nums">{{ session.staff.confirmed }}/{{ session.staff.needed }}</strong>
            </span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
