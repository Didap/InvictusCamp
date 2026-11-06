<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { DocumentDetail, RemindResult } from '#shared/types/documents'
import { enumLabel } from '#shared/utils/constants'
import { formatDateTime, formatDay } from '#shared/utils/format'

// One document: who must sign it and where each person is (reminders, cancellations, signed copies),
// its details and a preview. "Assegna" is the primary action; archive and edit sit in the menu.
const route = useRoute()
const api = useApi()
const confirm = useConfirm()
const documentId = computed(() => String(route.params.id))
const {
  data: doc,
  error,
  refresh,
} = await useApiFetch<DocumentDetail>(() => `/api/admin/documents/${documentId.value}`)

const assignOpen = ref(false)
const editOpen = ref(false)
const replaceOpen = ref(false)
const search = ref('')
const statusFilter = ref('all')

const verb = computed(() => (doc.value?.requiresSignature ? 'firmare' : 'leggere'))
const pendingCount = computed(() => doc.value?.requests.filter(r => r.status === 'pending').length ?? 0)
const copiesOpen = ref(false)
const signedCopies = computed(() => doc.value?.requests.filter(r => r.hasSignedCopy) ?? [])
const copyUrl = (requestId: string, download = false) =>
  `/api/signatures/${requestId}/copy${download ? '?download' : ''}`
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (doc.value?.requests ?? []).filter(
    r =>
      (statusFilter.value === 'all' || r.status === statusFilter.value) &&
      (!q ||
        r.person.name.toLowerCase().includes(q) ||
        r.person.email.includes(q) ||
        r.person.familyName?.toLowerCase().includes(q)),
  )
})
const statusItems = computed(() => [
  { label: 'Tutti gli stati', value: 'all' },
  { label: doc.value?.requiresSignature ? 'Da firmare' : 'Da leggere', value: 'pending' },
  { label: doc.value?.requiresSignature ? 'Firmati' : 'Letti', value: 'signed' },
  { label: 'Annullati', value: 'cancelled' },
])

const details = computed(() => {
  const d = doc.value
  if (!d) return []
  return [
    { label: 'Categoria', value: enumLabel('documentCategory', d.category) },
    {
      label: 'Cosa chiede',
      value: d.requiresSignature ? 'La firma, con un codice inviato via email' : 'La conferma di lettura',
    },
    { label: 'Sessione', value: d.session?.title ?? 'Nessuna: vale per tutto il camp' },
    { label: 'Caricato', value: `${formatDateTime(d.createdAt)}${d.createdBy ? `, da ${d.createdBy}` : ''}` },
    { label: 'Descrizione', value: d.description },
    { label: 'Impronta SHA-256 del file', value: d.file.sha256 },
  ]
})

async function reload() {
  await Promise.all([refresh(), refreshNuxtData('admin-documents')])
}

async function remindAll() {
  const count = pendingCount.value
  if (!count || !doc.value) return
  const ok = await confirm({
    title: 'Sollecitare tutti?',
    description: `${count === 1 ? 'Partirà 1 email' : `Partiranno ${count} email`}: un promemoria a chi deve ancora ${verb.value} «${doc.value.title}».`,
    confirmLabel: count === 1 ? 'Invia 1 email' : `Invia ${count} email`,
  })
  if (!ok) return
  try {
    const result = await api<RemindResult>(`/api/admin/documents/${documentId.value}/remind`, { method: 'POST' })
    notifySuccess(
      'Promemoria inviati',
      result.emails === 1 ? 'È partita 1 email.' : `Sono partite ${result.emails} email.`,
    )
    await reload()
  } catch (error) {
    notifyError(error)
  }
}

async function setArchived(archived: boolean) {
  if (archived) {
    const count = pendingCount.value
    const ok = await confirm({
      title: 'Archiviare il documento?',
      description: count
        ? `${count === 1 ? 'La richiesta ancora aperta viene annullata' : `Le ${count} richieste ancora aperte vengono annullate`}, senza inviare email. Le firme raccolte restano qui.`
        : 'Non comparirà più tra i documenti da assegnare. Le firme raccolte restano qui.',
      confirmLabel: 'Archivia',
      danger: count > 0,
    })
    if (!ok) return
  }
  try {
    const result = await api<{ cancelled: number }>(`/api/admin/documents/${documentId.value}/archive`, {
      method: 'POST',
      body: { archived },
    })
    notifySuccess(
      archived ? 'Documento archiviato' : 'Documento ripristinato',
      result.cancelled
        ? `${result.cancelled === 1 ? 'Annullata 1 richiesta' : `Annullate ${result.cancelled} richieste`}.`
        : undefined,
    )
    await reload()
  } catch (error) {
    notifyError(error)
  }
}

async function onReplaced() {
  replaceOpen.value = false
  await reload()
}

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const d = doc.value
  if (!d) return []
  return [
    [
      { label: 'Modifica i dettagli', icon: 'i-lucide-pencil', onSelect: () => (editOpen.value = true) },
      ...(d.locked
        ? []
        : [{ label: 'Sostituisci il file', icon: 'i-lucide-file-up', onSelect: () => (replaceOpen.value = true) }]),
      {
        label: 'Scarica il PDF originale',
        icon: 'i-lucide-download',
        href: `/api/files/${d.file.id}?download`,
        external: true,
      },
    ],
    [
      d.archivedAt
        ? { label: 'Ripristina', icon: 'i-lucide-archive-restore', onSelect: () => setArchived(false) }
        : { label: 'Archivia', icon: 'i-lucide-archive', onSelect: () => setArchived(true) },
    ],
  ]
})
</script>

<template>
  <IcPage :title="doc?.title ?? 'Documento'" back="/admin/documenti" width="wide">
    <template v-if="doc" #actions>
      <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
        <UButton icon="i-lucide-ellipsis" color="neutral" variant="outline" aria-label="Altre azioni sul documento" />
      </UDropdownMenu>
      <UButton
        icon="i-lucide-user-plus"
        label="Assegna"
        :disabled="!!doc.archivedAt"
        :ui="{ label: 'max-sm:sr-only' }"
        @click="assignOpen = true"
      />
    </template>

    <UEmpty
      v-if="error || !doc"
      icon="i-lucide-file-x"
      title="Documento non trovato"
      description="Forse il link è sbagliato. Trovi tutti i documenti nella pagina Documenti."
      :actions="[{ label: 'Vai ai documenti', to: '/admin/documenti', icon: 'i-lucide-files' }]"
    />

    <template v-else>
      <UAlert
        v-if="doc.archivedAt"
        color="neutral"
        variant="subtle"
        icon="i-lucide-archive"
        title="Documento archiviato"
        :description="`Dal ${formatDay(doc.archivedAt.slice(0, 10), 'long')}. Non si può assegnare né firmare: ripristinalo per usarlo di nuovo.`"
        :actions="[{ label: 'Ripristina', color: 'neutral', variant: 'outline', onClick: () => setArchived(false) }]"
        class="mb-8"
      />

      <div class="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <span class="inline-flex items-center gap-1.5">
          <UIcon
            :name="doc.requiresSignature ? 'i-lucide-signature' : 'i-lucide-eye'"
            class="size-4"
            aria-hidden="true"
          />
          {{ doc.requiresSignature ? 'Da firmare' : 'Da leggere' }}
        </span>
        <span>{{ enumLabel('documentCategory', doc.category) }}</span>
        <span v-if="doc.session">{{ doc.session.title }}</span>
      </div>

      <IcSection
        :title="doc.requiresSignature ? 'Firme' : 'Letture'"
        :description="
          doc.requiresSignature
            ? 'Chi deve firmare il documento e a che punto è. Ogni firma è confermata da un codice inviato via email.'
            : 'Chi deve leggere il documento e chi ha confermato la lettura.'
        "
      >
        <template v-if="pendingCount || signedCopies.length" #actions>
          <UButton
            v-if="signedCopies.length"
            icon="i-lucide-file-check"
            color="neutral"
            variant="outline"
            :label="`Copie firmate (${signedCopies.length})`"
            @click="copiesOpen = true"
          />
          <UButton
            v-if="pendingCount"
            icon="i-lucide-bell-ring"
            color="neutral"
            variant="outline"
            :label="`Sollecita tutti (${pendingCount})`"
            @click="remindAll"
          />
        </template>

        <UEmpty
          v-if="!doc.requests.length"
          icon="i-lucide-user-plus"
          :title="`Ancora nessuno deve ${doc.requiresSignature ? 'firmarlo' : 'leggerlo'}`"
          description="Assegnalo a persone scelte, a tutte le famiglie, a tutto lo staff o a una sessione: ognuno riceve un’email con il link."
          :actions="
            doc.archivedAt
              ? []
              : [
                  {
                    label: 'Assegna',
                    icon: 'i-lucide-user-plus',
                    color: 'neutral',
                    variant: 'outline',
                    onClick: () => (assignOpen = true),
                  },
                ]
          "
        />

        <template v-else>
          <DocumentsSignatureProgress
            :signed="doc.progress.signed"
            :assigned="doc.progress.assigned"
            :requires-signature="doc.requiresSignature"
            class="mb-6 max-w-sm"
          />
          <div v-if="doc.requests.length > 5" class="mb-4 flex flex-col gap-3 sm:flex-row">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Cerca per nome, famiglia o email"
              aria-label="Cerca una persona"
              class="w-full sm:w-72"
            />
            <USelect v-model="statusFilter" :items="statusItems" aria-label="Stato" class="w-full sm:w-48" />
          </div>
          <p v-if="!rows.length" class="text-muted">Nessuna richiesta corrisponde alla ricerca.</p>
          <DocumentsSignatureRequestList v-else :rows="rows" show="person" @changed="reload" />
        </template>
      </IcSection>

      <IcSection title="Dettagli">
        <IcDataList :items="details" :columns="2" />
        <div class="mt-6">
          <p class="text-sm font-semibold text-muted">File</p>
          <IcFileLink :file="doc.file" class="mt-1" />
        </div>
      </IcSection>

      <IcSection title="Anteprima">
        <IcPdfViewer :src="`/api/files/${doc.file.id}`" :title="doc.title" />
      </IcSection>

      <UModal
        v-model:open="copiesOpen"
        title="Copie firmate"
        description="Ogni copia è il documento originale con in fondo la pagina che certifica la firma."
      >
        <template #body>
          <ul class="divide-y divide-default">
            <li v-for="row in signedCopies" :key="row.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div class="min-w-0 flex-1">
                <p class="font-semibold break-words text-highlighted">{{ row.person.familyName ?? row.person.name }}</p>
                <p class="text-sm text-muted">
                  <template v-if="row.person.familyName">{{ row.person.name }}, </template>firmato il
                  {{ formatDateTime(row.signedAt) }}
                </p>
              </div>
              <UButton
                :href="copyUrl(row.id)"
                external
                target="_blank"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                class="pointer-coarse:size-11 pointer-coarse:justify-center"
                :aria-label="`Apri la copia firmata da ${row.person.name}`"
              />
              <UButton
                :href="copyUrl(row.id, true)"
                external
                icon="i-lucide-download"
                color="neutral"
                variant="outline"
                class="pointer-coarse:size-11 pointer-coarse:justify-center"
                :aria-label="`Scarica la copia firmata da ${row.person.name}`"
              />
            </li>
          </ul>
        </template>
      </UModal>
      <DocumentsAssignModal v-model:open="assignOpen" :document-id="doc.id" @assigned="reload" />
      <DocumentsDocumentFormModal v-model:open="editOpen" :document="doc" @saved="reload" />
      <UModal
        v-model:open="replaceOpen"
        title="Sostituisci il file"
        description="Nessuno lo ha ancora firmato: puoi caricare una versione corretta. I codici già inviati smettono di valere."
      >
        <template #body>
          <IcFileUpload
            :endpoint="`/api/admin/documents/${doc.id}/file`"
            accept="application/pdf"
            description="Solo PDF, fino a 15 MB"
            button-label="Sostituisci il file"
            @uploaded="onReplaced"
          />
        </template>
      </UModal>
    </template>
  </IcPage>
</template>
