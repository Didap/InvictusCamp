<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { DocumentListItem } from '#shared/types/documents'
import { DOCUMENT_AUDIENCES, enumLabel, type DocumentAudience } from '#shared/utils/constants'
import { formatDay } from '#shared/utils/format'

// Documents of the administration: what each one asks (to sign or to read), its session, how many
// people signed out of those assigned. "Carica un documento" is the primary action.
const { data, error, refresh } = await useApiFetch<DocumentListItem[]>('/api/admin/documents', {
  key: 'admin-documents',
})
const { options } = useEnums()
const route = useRoute()
const router = useRouter()

const tab = computed({
  get: () => (route.query.vista === 'archiviati' ? 'archived' : 'active'),
  set: (value: string) =>
    router.replace({ query: { ...route.query, vista: value === 'archived' ? 'archiviati' : undefined } }),
})
const search = ref('')
const category = ref('all')
const kind = ref('all')
const audience = ref<DocumentAudience | 'all'>('all')

const all = computed(() => data.value ?? [])
const active = computed(() => all.value.filter(d => !d.archivedAt))
const archived = computed(() => all.value.filter(d => d.archivedAt))
const filtering = computed(
  () => !!search.value.trim() || category.value !== 'all' || kind.value !== 'all' || audience.value !== 'all',
)
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (tab.value === 'archived' ? archived.value : active.value).filter(
    d =>
      (!q || d.title.toLowerCase().includes(q) || d.session?.title.toLowerCase().includes(q)) &&
      (category.value === 'all' || d.category === category.value) &&
      (kind.value === 'all' || (kind.value === 'sign') === d.requiresSignature) &&
      (audience.value === 'all' || d.audiences.includes(audience.value)),
  )
})

const tabItems = computed(() => [
  { label: `In uso (${active.value.length})`, value: 'active', icon: 'i-lucide-files' },
  { label: `Archiviati (${archived.value.length})`, value: 'archived', icon: 'i-lucide-archive' },
])
const categoryItems = computed(() => [{ label: 'Tutte le categorie', value: 'all' }, ...options('documentCategory')])
const kindItems = [
  { label: 'Da firmare e da leggere', value: 'all' },
  { label: 'Da firmare', value: 'sign' },
  { label: 'Da leggere', value: 'read' },
]

// Point 7: who the document went to. A document not assigned yet shows only with "Tutti i destinatari".
const audienceLabel = (a: DocumentAudience) => (a === 'family' ? 'Famiglie' : enumLabel('staffTeam', a))
const audienceItems = [
  { label: 'Tutti i destinatari', value: 'all' },
  ...DOCUMENT_AUDIENCES.map(value => ({ label: audienceLabel(value), value })),
]
const audiencesOf = (d: DocumentListItem) => d.audiences.map(audienceLabel).join(', ')

function clearFilters() {
  search.value = ''
  category.value = 'all'
  kind.value = 'all'
  audience.value = 'all'
}

const uploadOpen = ref(false)
async function onCreated(id: string) {
  await refresh()
  await navigateTo(`/admin/documenti/${id}`)
}

const UButton = resolveComponent('UButton')
function sortableHeader(label: string) {
  return ({
    column,
  }: {
    column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (desc?: boolean) => void }
  }) => {
    const sorted = column.getIsSorted()
    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label,
      icon: sorted
        ? sorted === 'asc'
          ? 'i-lucide-arrow-up-narrow-wide'
          : 'i-lucide-arrow-down-wide-narrow'
        : 'i-lucide-arrow-up-down',
      class: '-mx-2.5 font-semibold text-muted',
      'aria-label': `Ordina per ${label.toLowerCase()}`,
      onClick: () => column.toggleSorting(sorted === 'asc'),
    })
  }
}
const sorting = ref([{ id: 'createdAt', desc: true }])
const columns: TableColumn<DocumentListItem>[] = [
  { accessorKey: 'title', header: sortableHeader('Documento') },
  { accessorKey: 'category', header: 'Categoria' },
  { id: 'session', header: 'Sessione' },
  { id: 'kind', header: 'Richiede' },
  { id: 'audiences', header: 'Destinatari' },
  { id: 'progress', header: 'Avanzamento' },
  { accessorKey: 'createdAt', header: sortableHeader('Caricato il') },
]
</script>

<template>
  <IcPage title="Documenti" width="wide">
    <template #actions>
      <UButton icon="i-lucide-upload" label="Carica un documento" @click="uploadOpen = true" />
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare i documenti"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <UEmpty
      v-else-if="!all.length"
      icon="i-lucide-files"
      title="Nessun documento"
      description="Carica il regolamento, l’informativa privacy o un contratto: poi scegli chi deve firmarlo o leggerlo, e il gestionale manda a ciascuno un’email con il link."
      :actions="[
        {
          label: 'Carica un documento',
          icon: 'i-lucide-upload',
          color: 'neutral',
          variant: 'outline',
          onClick: () => (uploadOpen = true),
        },
      ]"
    />

    <template v-else>
      <UTabs v-model="tab" :items="tabItems" :content="false" variant="link" class="mb-5" />

      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Cerca per titolo o sessione"
          aria-label="Cerca un documento"
          class="w-full sm:w-72"
        />
        <USelect v-model="category" :items="categoryItems" aria-label="Categoria" class="w-full sm:w-56" />
        <USelect v-model="kind" :items="kindItems" aria-label="Cosa chiede il documento" class="w-full sm:w-56" />
        <USelect v-model="audience" :items="audienceItems" aria-label="Destinatari" class="w-full sm:w-52" />
        <UButton
          v-if="filtering"
          color="neutral"
          variant="link"
          icon="i-lucide-x"
          label="Azzera i filtri"
          @click="clearFilters"
        />
      </div>

      <UEmpty
        v-if="!rows.length"
        :icon="filtering ? 'i-lucide-search-x' : 'i-lucide-archive'"
        :title="filtering ? 'Nessun documento corrisponde ai filtri' : 'Nessun documento archiviato'"
        :description="
          filtering
            ? 'Prova a cercare con altre parole o azzera i filtri.'
            : 'Archivia i documenti che non usi più: escono dalle scelte ma restano qui, con le loro firme.'
        "
        :actions="
          filtering ? [{ label: 'Azzera i filtri', color: 'neutral', variant: 'outline', onClick: clearFilters }] : []
        "
      />

      <template v-else>
        <UTable
          v-model:sorting="sorting"
          :data="rows"
          :columns="columns"
          class="hidden rounded-lg border border-default bg-elevated md:block"
          :ui="{ th: 'text-sm font-semibold text-muted', td: 'align-top text-default whitespace-normal' }"
        >
          <template #title-cell="{ row }">
            <ULink :to="`/admin/documenti/${row.original.id}`" class="font-semibold text-primary hover:underline">
              {{ row.original.title }}
            </ULink>
          </template>
          <template #category-cell="{ row }">
            {{ enumLabel('documentCategory', row.original.category) }}
          </template>
          <template #session-cell="{ row }">
            <span v-if="row.original.session">{{ row.original.session.title }}</span>
            <span v-else class="text-muted">Tutto il camp</span>
          </template>
          <template #kind-cell="{ row }">
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
              <UIcon
                :name="row.original.requiresSignature ? 'i-lucide-signature' : 'i-lucide-eye'"
                class="size-4 text-muted"
                aria-hidden="true"
              />
              {{ row.original.requiresSignature ? 'Firma' : 'Lettura' }}
            </span>
          </template>
          <template #audiences-cell="{ row }">
            <span v-if="row.original.audiences.length">{{ audiencesOf(row.original) }}</span>
            <span v-else class="text-muted">Non ancora assegnato</span>
          </template>
          <template #progress-cell="{ row }">
            <DocumentsSignatureProgress
              :signed="row.original.progress.signed"
              :assigned="row.original.progress.assigned"
              :requires-signature="row.original.requiresSignature"
            />
          </template>
          <template #createdAt-cell="{ row }">
            <span class="tabular-nums">{{ formatDay(row.original.createdAt.slice(0, 10)) }}</span>
          </template>
        </UTable>

        <ul class="divide-y divide-default rounded-lg border border-default bg-elevated md:hidden">
          <li v-for="doc in rows" :key="doc.id">
            <NuxtLink
              :to="`/admin/documenti/${doc.id}`"
              class="flex items-start gap-3 p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              <div class="min-w-0 flex-1 space-y-2">
                <p class="font-semibold break-words text-primary">{{ doc.title }}</p>
                <p class="text-sm text-muted">
                  {{ enumLabel('documentCategory', doc.category) }} ·
                  {{ doc.requiresSignature ? 'Da firmare' : 'Da leggere' }}
                  <template v-if="doc.session"> · {{ doc.session.title }}</template>
                  <template v-if="doc.audiences.length"> · {{ audiencesOf(doc) }}</template>
                </p>
                <DocumentsSignatureProgress
                  :signed="doc.progress.signed"
                  :assigned="doc.progress.assigned"
                  :requires-signature="doc.requiresSignature"
                />
              </div>
              <UIcon name="i-lucide-chevron-right" class="mt-1 size-5 shrink-0 text-dimmed" aria-hidden="true" />
            </NuxtLink>
          </li>
        </ul>
      </template>
    </template>

    <DocumentsDocumentFormModal v-model:open="uploadOpen" @saved="onCreated" />
  </IcPage>
</template>
