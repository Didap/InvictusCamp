<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { ContactBulkInput, ContactFilter } from '#shared/schemas/contacts'
import type { Paginated } from '#shared/types/api'
import type { ContactListItem } from '#shared/types/contacts'
import { type ContactKind, enumLabel } from '#shared/utils/constants'
import { fullName, plural } from '#shared/utils/format'

// The «Anagrafica» (docs/spec.md 3.16): every person the camp keeps in touch with, with an account or without.
// Search, filter by type and group, add one by hand or import a pasted list, put many in a group at once
// (the ones ticked, or every one the filters find), export the CSV for a mailing list.
const PAGE_SIZE = 50
const route = useRoute()
const router = useRouter()
const api = useApi()
const confirm = useConfirm()
const { options } = useEnums()
const { groups, groupName, refresh: refreshGroups } = useContactGroups()

const fromQuery = (value: unknown, fallback = 'all') => (typeof value === 'string' && value ? value : fallback)
const q = ref(fromQuery(route.query.q, ''))
const kind = ref(fromQuery(route.query.kind))
const group = ref(fromQuery(route.query.group))
const page = ref(Number(route.query.page) || 1)
const search = refDebounced(q, 300)

const filter = computed<ContactFilter>(() => ({
  q: search.value.trim() || undefined,
  kind: kind.value === 'all' ? undefined : (kind.value as ContactKind),
  group: group.value === 'all' ? undefined : group.value,
}))
const filtered = computed(() => Boolean(filter.value.q || filter.value.kind || filter.value.group))
watch(filter, () => {
  page.value = 1
  clearSelection()
})
const query = computed(() => ({ ...filter.value, page: page.value > 1 ? page.value : undefined }))
watch(query, value => router.replace({ query: value }))

const { data, pending, refresh } = await useApiFetch<Paginated<ContactListItem>>('/api/admin/contacts', {
  query: computed(() => ({ ...query.value, pageSize: PAGE_SIZE })),
})
const total = computed(() => data.value?.total ?? 0)
// After a delete the page may be past the end: go back to the last one instead of showing an empty list.
watch(data, value => {
  if (value && !value.items.length && page.value > 1) page.value = Math.max(1, Math.ceil(value.total / PAGE_SIZE))
})
function resetFilters() {
  q.value = ''
  kind.value = 'all'
  group.value = 'all'
}

const kindItems = [{ value: 'all', label: 'Tutti i tipi' }, ...options('contactKind')]
const groupItems = computed(() => [
  { value: 'all', label: 'Tutti i gruppi' },
  { value: 'none', label: 'Senza gruppo' },
  ...groups.value.map(item => ({ value: item.id, label: `${item.name} (${item.count})` })),
])
// The group of the filter was deleted (in «Gruppi», or elsewhere): back to every group.
watch(groups, value => {
  if (value.length && !['all', 'none'].includes(group.value) && !value.some(item => item.id === group.value)) {
    group.value = 'all'
  }
})
const exportUrl = computed(() => {
  const params = new URLSearchParams(
    Object.entries(filter.value).filter((entry): entry is [string, string] => Boolean(entry[1])),
  )
  return `/api/admin/contacts/export?${params}`
})

// ─── Selection ───
const selected = ref(new Set<string>())
/** Every contact the filters find, not only the ones ticked on this page. */
const allFound = ref(false)
function clearSelection() {
  selected.value = new Set()
  allFound.value = false
}
const pageIds = computed(() => data.value?.items.map(item => item.id) ?? [])
const pageChecked = computed<boolean | 'indeterminate'>(() => {
  if (allFound.value) return true
  const ticked = pageIds.value.filter(id => selected.value.has(id)).length
  return ticked && ticked === pageIds.value.length ? true : ticked ? 'indeterminate' : false
})
/** Changing one box while «all found» is on keeps what is in sight: this page, then the change. */
function tick(ids: string[], value: boolean) {
  const next = new Set(allFound.value ? pageIds.value : selected.value)
  for (const id of ids) {
    if (value) next.add(id)
    else next.delete(id)
  }
  selected.value = next
  allFound.value = false
}
const selectedCount = computed(() => (allFound.value ? total.value : selected.value.size))
const selectionLabel = computed(() => plural(selectedCount.value, 'contatto', 'contatti'))

// ─── Actions ───
const contactOpen = ref(false)
const editing = ref<ContactListItem | null>(null)
const importOpen = ref(false)
const groupsOpen = ref(false)
function openContact(contact: ContactListItem | null) {
  editing.value = contact
  contactOpen.value = true
}
async function reload() {
  await Promise.all([refresh(), refreshGroups()])
}

/** Runs an action on the selection; `done` says what happened to how many. */
async function runBulk(body: ContactBulkInput, done: (count: number) => string) {
  try {
    const { count } = await api<{ count: number }>('/api/admin/contacts/bulk', { method: 'POST', body })
    notifySuccess(done(count))
    clearSelection()
    await reload()
  } catch (error) {
    notifyError(error)
  }
}
const selection = (): ContactBulkInput['selection'] =>
  allFound.value ? { filter: filter.value } : { ids: [...selected.value] }

function addToGroup(groupId: string) {
  const name = groupName(groupId)
  return runBulk({ selection: selection(), action: 'add_to_group', groupId }, count =>
    count ? `${plural(count, 'contatto aggiunto', 'contatti aggiunti')} a «${name}»` : `Erano già tutti in «${name}»`,
  )
}
async function removeFromGroup(groupId: string) {
  const name = groupName(groupId)
  const ok = await confirm({
    title: `Togli ${selectionLabel.value} da «${name}»?`,
    description: 'Restano in anagrafica e negli altri gruppi. Non parte nessuna email.',
    confirmLabel: 'Togli dal gruppo',
  })
  if (!ok) return
  return runBulk({ selection: selection(), action: 'remove_from_group', groupId }, count =>
    count ? `${plural(count, 'contatto tolto', 'contatti tolti')} da «${name}»` : `Nessuno era in «${name}»`,
  )
}
async function setKind(value: ContactKind) {
  const ok = await confirm({
    title: `Cambi il tipo di ${selectionLabel.value} in «${enumLabel('contactKind', value)}»?`,
    description: 'Il tipo di prima non si recupera. Non parte nessuna email.',
    confirmLabel: 'Cambia il tipo',
  })
  if (!ok) return
  return runBulk({ selection: selection(), action: 'set_kind', kind: value }, count =>
    count ? `Tipo cambiato a ${plural(count, 'contatto', 'contatti')}` : 'Avevano già tutti quel tipo',
  )
}
async function deleteSelected() {
  const ok = await confirm({
    title: `Elimini ${selectionLabel.value} dall’anagrafica?`,
    description: 'Gli account con la stessa email restano. Non parte nessuna email.',
    confirmLabel: 'Elimina',
    danger: true,
  })
  if (ok) {
    await runBulk({ selection: selection(), action: 'delete' }, count =>
      plural(count, 'contatto eliminato', 'contatti eliminati'),
    )
  }
}
async function deleteOne(contact: ContactListItem) {
  const ok = await confirm({
    title: `Elimini ${fullName(contact) || contact.email} dall’anagrafica?`,
    description: 'Un account con la stessa email resta. Non parte nessuna email.',
    confirmLabel: 'Elimina',
    danger: true,
  })
  if (!ok) return
  try {
    const url: string = `/api/admin/contacts/${contact.id}`
    await api<{ ok: true }>(url, { method: 'DELETE' })
    notifySuccess('Contatto eliminato', contact.email)
    selected.value.delete(contact.id)
    await reload()
  } catch (error) {
    notifyError(error)
  }
}

const groupChoices = (action: (id: string) => unknown): DropdownMenuItem[] =>
  groups.value.length
    ? groups.value.map(item => ({ label: item.name, onSelect: () => action(item.id) }))
    : [{ label: 'Crea prima un gruppo', icon: 'i-lucide-plus', onSelect: () => (groupsOpen.value = true) }]
const addItems = computed(() => [
  ...groupChoices(addToGroup),
  ...(groups.value.length
    ? [
        { type: 'separator' as const },
        { label: 'Nuovo gruppo', icon: 'i-lucide-plus', onSelect: () => (groupsOpen.value = true) },
      ]
    : []),
])
const removeItems = computed(() => groupChoices(removeFromGroup))
const kindChoices = options('contactKind').map(option => ({
  label: option.label,
  icon: option.icon,
  onSelect: () => setKind(option.value as ContactKind),
}))
const rowActions = (contact: ContactListItem): DropdownMenuItem[][] => [
  [{ label: 'Modifica', icon: 'i-lucide-pencil', onSelect: () => openContact(contact) }],
  [{ label: 'Elimina', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => deleteOne(contact) }],
]
const groupsOf = (contact: ContactListItem) => contact.groupIds.flatMap(id => groupName(id) ?? [])

const UCheckbox = resolveComponent('UCheckbox')
const columns: TableColumn<ContactListItem>[] = [
  {
    id: 'select',
    header: () =>
      h(UCheckbox, {
        modelValue: pageChecked.value,
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => tick(pageIds.value, value === true),
        'aria-label': 'Seleziona i contatti della pagina',
      }),
  },
  { id: 'person', header: 'Persona' },
  { accessorKey: 'kind', header: 'Tipo' },
  { id: 'groups', header: 'Gruppi' },
  { accessorKey: 'accountRole', header: 'Account' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Azioni') },
]
</script>

<template>
  <IcPage title="Anagrafica" width="wide">
    <template #actions>
      <UButton
        icon="i-lucide-folders"
        color="neutral"
        variant="outline"
        aria-label="Gestisci i gruppi"
        @click="groupsOpen = true"
      >
        <span class="hidden sm:inline">Gruppi</span>
      </UButton>
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
      <UButton
        icon="i-lucide-user-plus"
        color="neutral"
        variant="outline"
        aria-label="Aggiungi un contatto"
        @click="openContact(null)"
      >
        <span class="hidden sm:inline">Aggiungi</span>
      </UButton>
      <UButton icon="i-lucide-upload" aria-label="Importa un elenco" @click="importOpen = true">
        <span class="hidden sm:inline">Importa un elenco</span>
      </UButton>
    </template>

    <div class="mb-5 flex flex-wrap items-center gap-3">
      <UInput
        v-model="q"
        type="search"
        icon="i-lucide-search"
        placeholder="Cerca per nome o email"
        aria-label="Cerca un contatto"
        class="w-full sm:w-72"
      />
      <USelect v-model="kind" :items="kindItems" aria-label="Tipo" class="w-full sm:w-44" />
      <USelect v-model="group" :items="groupItems" aria-label="Gruppo" class="w-full sm:w-56" />
      <p class="text-sm text-muted sm:ms-auto" aria-live="polite">{{ plural(total, 'contatto', 'contatti') }}</p>
    </div>

    <div
      v-if="selectedCount"
      class="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-default bg-elevated p-3"
      role="region"
      aria-label="Azioni sui contatti selezionati"
    >
      <p class="font-semibold text-highlighted" aria-live="polite">
        {{ selectionLabel }} {{ selectedCount === 1 ? 'selezionato' : 'selezionati' }}
      </p>
      <UButton color="neutral" variant="link" label="Annulla la selezione" class="me-auto" @click="clearSelection" />
      <UDropdownMenu :items="addItems">
        <UButton icon="i-lucide-folder-plus" color="neutral" variant="outline" label="Aggiungi a un gruppo" />
      </UDropdownMenu>
      <UDropdownMenu :items="removeItems">
        <UButton icon="i-lucide-folder-minus" color="neutral" variant="outline" label="Togli da un gruppo" />
      </UDropdownMenu>
      <UDropdownMenu :items="kindChoices">
        <UButton icon="i-lucide-tag" color="neutral" variant="outline" label="Cambia tipo" />
      </UDropdownMenu>
      <UButton icon="i-lucide-trash-2" color="error" variant="ghost" label="Elimina" @click="deleteSelected" />
      <p v-if="pageChecked === true && !allFound && total > pageIds.length" class="w-full text-sm">
        Hai selezionato i contatti di questa pagina.
        <UButton
          variant="link"
          :label="`Seleziona tutti i ${total} contatti trovati`"
          class="p-0"
          @click="allFound = true"
        />
      </p>
      <p v-else-if="allFound" class="w-full text-sm text-muted">
        Le azioni valgono per tutti i {{ total }} contatti trovati con questi filtri, anche nelle altre pagine.
      </p>
    </div>

    <UEmpty
      v-if="data && !data.items.length"
      icon="i-lucide-book-user"
      :title="filtered ? 'Nessun contatto trovato' : 'L’anagrafica è vuota'"
      :description="
        filtered
          ? 'Prova con un’altra ricerca o togli i filtri.'
          : 'Importa il tuo elenco (incollato da Excel o da un file CSV) o aggiungi i contatti uno alla volta.'
      "
      :actions="
        filtered
          ? [
              {
                label: 'Togli i filtri',
                icon: 'i-lucide-x',
                color: 'neutral',
                variant: 'outline',
                onClick: resetFilters,
              },
            ]
          : [
              { label: 'Importa un elenco', icon: 'i-lucide-upload', onClick: () => (importOpen = true) },
              {
                label: 'Aggiungi un contatto',
                icon: 'i-lucide-user-plus',
                color: 'neutral',
                variant: 'outline',
                onClick: () => openContact(null),
              },
            ]
      "
    />

    <template v-else-if="data">
      <UTable
        :data="data.items"
        :columns="columns"
        :loading="pending"
        caption="Contatti dell’anagrafica"
        class="hidden rounded-lg border border-default bg-elevated md:block"
        :ui="{ td: 'whitespace-normal align-top' }"
      >
        <template #select-cell="{ row }">
          <UCheckbox
            :model-value="allFound || selected.has(row.original.id)"
            :aria-label="`Seleziona ${fullName(row.original) || row.original.email}`"
            @update:model-value="(value: boolean | 'indeterminate') => tick([row.original.id], value === true)"
          />
        </template>
        <template #person-cell="{ row }">
          <p class="font-semibold text-highlighted">{{ fullName(row.original) || row.original.email }}</p>
          <p v-if="fullName(row.original)" class="text-muted">{{ row.original.email }}</p>
        </template>
        <template #kind-cell="{ row }">
          <IcStatusBadge kind="contactKind" :value="row.original.kind" />
        </template>
        <template #groups-cell="{ row }">
          <div v-if="groupsOf(row.original).length" class="flex flex-wrap gap-1">
            <UBadge v-for="name in groupsOf(row.original)" :key="name" :label="name" color="neutral" variant="subtle" />
          </div>
          <span v-else class="text-muted">Nessuno</span>
        </template>
        <template #accountRole-cell="{ row }">
          <IcStatusBadge v-if="row.original.accountRole" kind="userRole" :value="row.original.accountRole" />
          <span v-else class="text-muted">Senza account</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                :aria-label="`Azioni per ${fullName(row.original) || row.original.email}`"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UTable>

      <div class="md:hidden">
        <UCheckbox
          :model-value="pageChecked"
          label="Seleziona i contatti della pagina"
          class="mb-3"
          @update:model-value="(value: boolean | 'indeterminate') => tick(pageIds, value === true)"
        />
        <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li v-for="contact in data.items" :key="contact.id" class="flex items-start gap-3 p-4">
            <UCheckbox
              :model-value="allFound || selected.has(contact.id)"
              :aria-label="`Seleziona ${fullName(contact) || contact.email}`"
              class="mt-1"
              @update:model-value="(value: boolean | 'indeterminate') => tick([contact.id], value === true)"
            />
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-highlighted">{{ fullName(contact) || contact.email }}</p>
              <p v-if="fullName(contact)" class="truncate text-sm text-muted">{{ contact.email }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <IcStatusBadge kind="contactKind" :value="contact.kind" />
                <IcStatusBadge v-if="contact.accountRole" kind="userRole" :value="contact.accountRole" />
                <UBadge v-for="name in groupsOf(contact)" :key="name" :label="name" color="neutral" variant="subtle" />
              </div>
            </div>
            <UDropdownMenu :items="rowActions(contact)" :content="{ align: 'end' }">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                class="size-11 justify-center"
                :aria-label="`Azioni per ${fullName(contact) || contact.email}`"
              />
            </UDropdownMenu>
          </li>
        </ul>
      </div>

      <div v-if="total > PAGE_SIZE" class="mt-5 flex justify-center">
        <UPagination v-model:page="page" :total="total" :items-per-page="PAGE_SIZE" />
      </div>
    </template>

    <ContactsContactModal v-model:open="contactOpen" :contact="editing" @saved="reload" />
    <ContactsImportModal v-model:open="importOpen" @imported="reload" />
    <ContactsGroupsModal v-model:open="groupsOpen" @changed="reload" />
  </IcPage>
</template>
