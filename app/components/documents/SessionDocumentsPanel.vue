<script setup lang="ts">
import type { DocumentListItem } from '#shared/types/documents'
import { enumLabel } from '#shared/utils/constants'

// CONTRACT (docs/BUILD.md): owned by A4 Documenti. Admin session page, tab "Documenti": the documents of
// the session (its own, and those asked to its families or staff) with the progress of this session's
// requests; upload one for the session, assign to its families or its staff. Props are final.
const props = defineProps<{ sessionId: string }>()

const { data, status, error, refresh } = useApiFetch<DocumentListItem[]>('/api/admin/documents', {
  query: computed(() => ({ sessionId: props.sessionId })),
  lazy: true,
})
const rows = computed(() => data.value ?? [])
const uploadOpen = ref(false)
const assignOpen = ref(false)
const assignDocumentId = ref<string>()

function assign(documentId?: string) {
  assignDocumentId.value = documentId
  assignOpen.value = true
}

async function onCreated(id: string) {
  await refresh()
  assign(id)
}

async function onAssigned() {
  await Promise.all([refresh(), refreshNuxtData('admin-documents')])
}
</script>

<template>
  <div>
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <p class="max-w-prose text-sm text-muted">
        I documenti della sessione e quelli chiesti alle sue famiglie o al suo staff. L’avanzamento conta le richieste
        di questa sessione.
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-upload"
          label="Carica un documento"
          @click="uploadOpen = true"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-user-plus"
          label="Assegna un documento"
          @click="assign()"
        />
      </div>
    </div>

    <div v-if="status === 'pending' && !data" class="space-y-2" aria-busy="true" aria-label="Caricamento dei documenti">
      <USkeleton v-for="i in 2" :key="i" class="h-16 w-full" />
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare i documenti della sessione"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />
    <UEmpty
      v-else-if="!rows.length"
      icon="i-lucide-files"
      title="Nessun documento per questa sessione"
      description="Carica il contratto dello staff o il regolamento, poi chiedine la firma alle famiglie o allo staff della sessione."
    />
    <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
      <li
        v-for="doc in rows"
        :key="doc.id"
        class="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-center sm:gap-6"
      >
        <div class="min-w-0">
          <ULink :to="`/admin/documenti/${doc.id}`" class="font-semibold break-words text-primary hover:underline">
            {{ doc.title }}
          </ULink>
          <p class="mt-0.5 text-sm text-muted">
            {{ enumLabel('documentCategory', doc.category) }} ·
            {{ doc.requiresSignature ? 'Da firmare' : 'Da leggere' }} ·
            {{ doc.session?.id === sessionId ? 'Della sessione' : 'Per tutto il camp' }}
            <template v-if="doc.archivedAt"> · Archiviato</template>
          </p>
        </div>
        <DocumentsSignatureProgress
          :signed="doc.progress.signed"
          :assigned="doc.progress.assigned"
          :requires-signature="doc.requiresSignature"
        />
        <UButton
          v-if="!doc.archivedAt"
          color="neutral"
          variant="outline"
          icon="i-lucide-user-plus"
          label="Assegna"
          class="justify-self-start"
          :aria-label="`Assegna «${doc.title}» alla sessione`"
          @click="assign(doc.id)"
        />
      </li>
    </ul>

    <DocumentsDocumentFormModal v-model:open="uploadOpen" :session-id="sessionId" @saved="onCreated" />
    <DocumentsAssignModal
      v-model:open="assignOpen"
      :document-id="assignDocumentId"
      :session-id="sessionId"
      @assigned="onAssigned"
    />
  </div>
</template>
