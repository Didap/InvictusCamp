<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { DISABILITY_CHOICES } from '#shared/content/member-form'
import {
  DISABILITY_COUNT_FILTERS,
  FAMILY_LIST_SORTS,
  GUEST_AGE_FILTERS,
  MEMBERS_FILTER_MAX,
  type FamilyListSort,
} from '#shared/schemas/families'
import type { FamilyListItem, FamilyListResponse } from '#shared/types/families'
import { formatAges, formatDayRange, fullName, plural } from '#shared/utils/format'

// The families of the camp for the administration: search, filters (questionnaire, region and province,
// members, young people with a condition: how many, of which type, how old), sortable columns. The only
// health detail shown is the ages of the members with a condition, never the condition itself
// (docs/spec.md, 5): the type is a filter only, audited by the server.
// Filters live in the query string, so the back button returns to the same list.
const PAGE_SIZE = 25
const ALL = 'all'
const FILTER_KEYS = ['q', 'formStatus', 'region', 'province', 'members', 'disability', 'condition', 'ageRange'] as const

const route = useRoute()
const router = useRouter()
const { options } = useEnums()

function queryValue(key: string): string | undefined {
  const value = route.query[key]
  return typeof value === 'string' && value ? value : undefined
}

function setQuery(patch: Record<string, string | undefined>, keepPage = false) {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...route.query, ...patch })) {
    if (typeof value === 'string' && value && !(key === 'page' && !keepPage)) next[key] = value
  }
  router.replace({ query: next })
}

const search = ref(queryValue('q') ?? '')
watchDebounced(search, value => setQuery({ q: value.trim() || undefined }), { debounce: 300 })

const sort = computed<FamilyListSort>(() => {
  const value = queryValue('sort')
  return (FAMILY_LIST_SORTS as readonly string[]).includes(value ?? '') ? (value as FamilyListSort) : 'name'
})
const order = computed<'asc' | 'desc'>(() => (queryValue('order') === 'desc' ? 'desc' : 'asc'))
const page = computed(() => Math.max(1, Number(queryValue('page') ?? 1) || 1))

const filterQuery = computed(() => ({
  ...Object.fromEntries(FILTER_KEYS.map(key => [key, queryValue(key)])),
  sort: sort.value,
  order: order.value,
}))
const { data, status } = await useApiFetch<FamilyListResponse>('/api/admin/families', {
  query: computed(() => ({ ...filterQuery.value, page: page.value, pageSize: PAGE_SIZE })),
})
const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)

const filtersActive = computed(() => FILTER_KEYS.some(key => Boolean(queryValue(key))))
function resetFilters() {
  search.value = ''
  setQuery(Object.fromEntries(FILTER_KEYS.map(key => [key, undefined])))
}

function filterModel(key: string) {
  return computed({
    get: () => queryValue(key) ?? ALL,
    set: (value: string) => setQuery({ [key]: value === ALL ? undefined : value }),
  })
}
const formStatusFilter = filterModel('formStatus')
const provinceFilter = filterModel('province')
const regionFilter = filterModel('region')
const disabilityFilter = filterModel('disability')
const conditionFilter = filterModel('condition')
const ageFilter = filterModel('ageRange')
const membersFilter = filterModel('members')
// A region narrows the provinces: one chosen elsewhere would match nothing.
watch(regionFilter, () => setQuery({ province: undefined }))

const formStatusItems = [
  { value: ALL, label: 'Tutti' },
  ...options('familyFormStatus').map(option => ({ value: option.value, label: option.label })),
]
/** A select over the values in use, "Tutte" first. */
const allOf = (values: string[] = []) => [
  { value: ALL, label: 'Tutte' },
  ...values.map(value => ({ value, label: value })),
]
const provinceItems = computed(() => allOf(data.value?.provinces))
const regionItems = computed(() => allOf(data.value?.regions))
const disabilityItems = [{ value: ALL, label: 'Tutte' }, ...DISABILITY_COUNT_FILTERS]
const conditionItems = [
  { value: ALL, label: 'Tutte' },
  ...DISABILITY_CHOICES.find(field => field.key === 'conditions')!.options,
]
const ageItems = [{ value: ALL, label: 'Tutte' }, ...GUEST_AGE_FILTERS]
const membersItems = [
  { value: ALL, label: 'Tutti' },
  ...Array.from({ length: MEMBERS_FILTER_MAX }, (_, i) => ({
    value: String(i + 1),
    label: i + 1 === MEMBERS_FILTER_MAX ? `${i + 1} o più` : String(i + 1),
  })),
]
/** The menu as wide as its longest choice, not as the field: every choice reads whole. */
const SELECT_UI = { content: 'min-w-fit' }

const exportUrl = computed(() => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filterQuery.value)) if (value) params.set(key, value)
  return `/api/admin/families/export?${params}`
})

// ─── Table ───
const UButton = resolveComponent('UButton')

function sortHeader(label: string, key: FamilyListSort) {
  return () => {
    const active = sort.value === key
    const next = active && order.value === 'asc' ? 'desc' : 'asc'
    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label,
      trailingIcon: active
        ? order.value === 'asc'
          ? 'i-lucide-arrow-up'
          : 'i-lucide-arrow-down'
        : 'i-lucide-arrow-up-down',
      class: '-mx-2.5 font-semibold',
      'aria-label': `${label}: ordina in ordine ${next === 'asc' ? 'crescente' : 'decrescente'}`,
      onClick: () => setQuery({ sort: key, order: next }),
    })
  }
}

const columns: TableColumn<FamilyListItem>[] = [
  { accessorKey: 'name', header: sortHeader('Famiglia', 'name') },
  { id: 'referent', header: 'Referente' },
  { accessorKey: 'city', header: sortHeader('Città', 'city') },
  { accessorKey: 'memberCount', header: sortHeader('Componenti', 'members') },
  { id: 'fragileAges', header: 'Ragazzi con fragilità' },
  { accessorKey: 'formStatus', header: 'Dati della famiglia' },
  { id: 'lastSession', header: 'Ultima sessione' },
]

function place(family: FamilyListItem): string {
  return [family.city, family.province ? `(${family.province})` : null].filter(Boolean).join(' ')
}

function openRow(event: Event, row: TableRow<FamilyListItem>) {
  if ((event.target as HTMLElement | null)?.closest('a, button')) return
  navigateTo(`/admin/famiglie/${row.original.id}`)
}
</script>

<template>
  <IcPage title="Famiglie" width="wide">
    <template #actions>
      <UButton
        :href="exportUrl"
        external
        icon="i-lucide-download"
        color="neutral"
        variant="outline"
        aria-label="Esporta l’elenco in CSV"
      >
        <span class="hidden sm:inline">Esporta CSV</span>
      </UButton>
    </template>

    <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UFormField label="Cerca" class="sm:col-span-2">
        <UInput
          v-model="search"
          type="search"
          icon="i-lucide-search"
          placeholder="Famiglia, referente, email, città o componente"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Dati della famiglia">
        <USelect v-model="formStatusFilter" :items="formStatusItems" value-key="value" :ui="SELECT_UI" class="w-full" />
      </UFormField>
      <UFormField label="Componenti">
        <USelect v-model="membersFilter" :items="membersItems" value-key="value" :ui="SELECT_UI" class="w-full" />
      </UFormField>
      <UFormField label="Regione">
        <USelect v-model="regionFilter" :items="regionItems" value-key="value" :ui="SELECT_UI" class="w-full" />
      </UFormField>
      <UFormField label="Provincia">
        <USelect v-model="provinceFilter" :items="provinceItems" value-key="value" :ui="SELECT_UI" class="w-full" />
      </UFormField>
      <UFormField label="Ragazzi con disabilità">
        <USelect v-model="disabilityFilter" :items="disabilityItems" value-key="value" :ui="SELECT_UI" class="w-full" />
      </UFormField>
      <UFormField label="Tipologia di disabilità">
        <USelect v-model="conditionFilter" :items="conditionItems" value-key="value" :ui="SELECT_UI" class="w-full" />
      </UFormField>
      <UFormField label="Età dei ragazzi con disabilità" class="sm:col-span-2">
        <USelect v-model="ageFilter" :items="ageItems" value-key="value" :ui="SELECT_UI" class="w-full" />
      </UFormField>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted" aria-live="polite">
        {{ plural(total, 'famiglia', 'famiglie') }}{{ filtersActive ? ' con questi filtri' : '' }}
      </p>
      <UButton
        v-if="filtersActive"
        label="Azzera i filtri"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        @click="resetFilters"
      />
    </div>

    <UEmpty
      v-if="status !== 'pending' && !items.length"
      icon="i-lucide-heart-handshake"
      :title="filtersActive ? 'Nessuna famiglia trovata' : 'Ancora nessuna famiglia'"
      :description="
        filtersActive
          ? 'Prova a cambiare la ricerca o i filtri.'
          : 'Le famiglie si registrano da sole dalla pagina di registrazione, oppure puoi invitarle da Utenti.'
      "
      :actions="
        filtersActive
          ? [{ label: 'Azzera i filtri', icon: 'i-lucide-x', onClick: resetFilters }]
          : [{ label: 'Invita una famiglia', icon: 'i-lucide-user-plus', to: '/admin/utenti' }]
      "
    />

    <template v-else>
      <UTable
        :data="items"
        :columns="columns"
        :loading="status === 'pending'"
        class="hidden rounded-lg border border-default bg-elevated xl:block"
        :ui="{ tr: 'cursor-pointer', td: 'whitespace-normal' }"
        @select="openRow"
      >
        <template #name-cell="{ row }">
          <ULink :to="`/admin/famiglie/${row.original.id}`" class="font-semibold text-primary hover:underline">
            {{ row.original.name }}
          </ULink>
        </template>
        <template #referent-cell="{ row }">
          {{ fullName(row.original.referent) }}
        </template>
        <template #city-cell="{ row }">
          <p :class="place(row.original) ? '' : 'text-dimmed'">{{ place(row.original) || 'Non indicata' }}</p>
          <p v-if="row.original.region" class="text-sm text-muted">{{ row.original.region }}</p>
        </template>
        <template #fragileAges-cell="{ row }">
          <span :class="row.original.fragileAges.length ? '' : 'text-dimmed'">
            {{ formatAges(row.original.fragileAges) || 'Nessuno' }}
          </span>
        </template>
        <template #memberCount-cell="{ row }">
          <span class="tabular-nums">{{ row.original.memberCount }}</span>
        </template>
        <template #formStatus-cell="{ row }">
          <IcStatusBadge kind="familyFormStatus" :value="row.original.formStatus" />
        </template>
        <template #lastSession-cell="{ row }">
          <template v-if="row.original.lastSession">
            <p class="text-highlighted">{{ row.original.lastSession.title }}</p>
            <p class="text-sm text-muted">
              {{ formatDayRange(row.original.lastSession.startDate, row.original.lastSession.endDate) }}
            </p>
          </template>
          <span v-else class="text-dimmed">Nessuna</span>
        </template>
      </UTable>

      <ul class="divide-y divide-default rounded-lg border border-default bg-elevated xl:hidden">
        <li v-for="family in items" :key="family.id">
          <NuxtLink
            :to="`/admin/famiglie/${family.id}`"
            class="flex items-start gap-3 p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <p class="font-semibold text-primary">{{ family.name }}</p>
              <p class="text-sm text-muted">
                {{ [fullName(family.referent), place(family), family.region].filter(Boolean).join(' · ') }}
              </p>
              <p v-if="family.fragileAges.length" class="text-sm text-muted">
                Ragazzi con fragilità: {{ formatAges(family.fragileAges) }}
              </p>
              <p class="text-sm text-muted">
                {{ plural(family.memberCount, 'componente', 'componenti')
                }}{{ family.lastSession ? ` · ${family.lastSession.title}` : '' }}
              </p>
              <IcStatusBadge kind="familyFormStatus" :value="family.formStatus" />
            </div>
            <UIcon name="i-lucide-chevron-right" class="mt-1 size-5 shrink-0 text-dimmed" aria-hidden="true" />
          </NuxtLink>
        </li>
      </ul>

      <div v-if="total > PAGE_SIZE" class="mt-6 flex justify-center">
        <UPagination
          :page="page"
          :total="total"
          :items-per-page="PAGE_SIZE"
          @update:page="value => setQuery({ page: String(value) }, true)"
        />
      </div>
    </template>
  </IcPage>
</template>
