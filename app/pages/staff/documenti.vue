<script setup lang="ts">
import {
  REQUIRED_STAFF_DOCUMENTS,
  STAFF_DOCUMENT_CATEGORIES,
  isRequiredStaffDocument,
  requiredDocumentsText,
} from '#shared/schemas/staff'
import type { MyStaffDocuments, StaffDocumentDto } from '#shared/types/staff'
import type { PersonalDocumentCategory } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDay } from '#shared/utils/format'

// Documents (spec 3.4): the required ones first, a CV (the application's counts) and an ID, in PDF; what the
// administration asks to sign (PendingSignatures, documents area); the other personal documents (titles,
// certificates), each with a category and a title, in PDF too.
const api = useApi()
const confirm = useConfirm()
const { label, options } = useEnums()
const { data, refresh } = await useApiFetch<MyStaffDocuments>('/api/staff/documents')
const documents = computed(() => data.value?.documents ?? [])
const missing = computed(() => data.value?.documentsMissing ?? [])
const required = computed(() =>
  REQUIRED_STAFF_DOCUMENTS.map(category => ({
    category,
    name: label('personalDocumentCategory', category),
    uploaded: documents.value.filter(document => document.category === category),
    missing: missing.value.includes(category),
    // One primary action on the page: the upload of the first one missing.
    primary: missing.value[0] === category,
  })),
)
const others = computed(() => documents.value.filter(document => !isRequiredStaffDocument(document.category)))

/** The required documents have their own place. */
const categoryItems = computed(() =>
  options(
    'personalDocumentCategory',
    STAFF_DOCUMENT_CATEGORIES.filter(category => !isRequiredStaffDocument(category)),
  ).map(option => ({ label: option.label, value: option.value as PersonalDocumentCategory })),
)
const upload = reactive({ category: 'certification' as PersonalDocumentCategory, title: '' })
const uploadKey = ref(0)
async function uploaded() {
  upload.title = ''
  uploadKey.value++
  await refresh()
}

const dayOf = (instant: string) => formatDay(todayIso(new Date(instant)), 'long')

const removing = ref<string | null>(null)
async function remove(document: StaffDocumentDto) {
  const ok = await confirm({
    title: `Elimini «${document.title}» (${document.file.originalName})?`,
    description: 'Il file viene cancellato e non lo vediamo più.',
    confirmLabel: 'Elimina',
    danger: true,
  })
  if (!ok) return
  removing.value = document.id
  try {
    await api(`/api/staff/documents/${document.id}`, { method: 'DELETE' })
    notifySuccess('Documento eliminato')
    await refresh()
  } catch (error) {
    notifyError(error)
  } finally {
    removing.value = null
  }
}
</script>

<template>
  <IcPage title="Documenti" width="narrow">
    <IcSection
      v-if="data"
      title="Documenti obbligatori"
      :description="
        missing.length
          ? `Per lavorare con te carica ${requiredDocumentsText(missing)}, in PDF.`
          : 'Il curriculum e il documento d’identità, in PDF: ci sono tutti e due.'
      "
    >
      <div class="space-y-6">
        <div v-for="r in required" :key="r.category">
          <h3 class="font-semibold text-highlighted">{{ r.name }}</h3>
          <div v-if="r.category === 'cv' && data.cv" class="mt-2">
            <IcFileLink :file="data.cv" />
            <p class="mt-1 text-sm text-muted">Inviato con la candidatura.</p>
          </div>
          <ul v-if="r.uploaded.length" class="mt-2 space-y-2">
            <li v-for="document in r.uploaded" :key="document.id" class="flex flex-wrap items-center gap-x-4 gap-y-1">
              <IcFileLink :file="document.file" />
              <UButton
                class="pointer-coarse:min-h-11"
                icon="i-lucide-trash-2"
                label="Elimina"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="removing === document.id"
                :aria-label="`Elimina ${document.file.originalName}`"
                @click="remove(document)"
              />
            </li>
          </ul>
          <p v-if="r.missing" class="mt-1 text-warning">
            {{ r.uploaded.length ? 'Da caricare in PDF' : 'Da caricare' }}
          </p>
          <IcFileUpload
            class="mt-3"
            endpoint="/api/staff/documents"
            accept="application/pdf"
            :description="r.category === 'id_document' ? 'PDF con fronte e retro, fino a 15 MB' : 'PDF, fino a 15 MB'"
            :fields="{ category: r.category, title: r.name }"
            :button-label="r.missing ? 'Carica il file' : 'Carica una versione aggiornata'"
            :secondary="!r.primary"
            @uploaded="refresh()"
          />
        </div>
      </div>
    </IcSection>

    <IcSection title="Da firmare" description="I documenti che ti chiediamo di leggere e firmare.">
      <DocumentsPendingSignatures />
    </IcSection>

    <IcSection title="I tuoi documenti" description="Titoli, attestati e certificati che vuoi condividere con noi.">
      <p v-if="!others.length" class="text-muted">Non hai ancora caricato altri documenti.</p>
      <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li
          v-for="document in others"
          :key="document.id"
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
        >
          <div class="min-w-0 space-y-1">
            <IcFileLink :file="document.file" :label="document.title" />
            <p class="text-sm text-muted">
              {{ label('personalDocumentCategory', document.category) }} · caricato il {{ dayOf(document.createdAt) }}
            </p>
          </div>
          <UButton
            class="pointer-coarse:min-h-11"
            icon="i-lucide-trash-2"
            label="Elimina"
            color="neutral"
            variant="ghost"
            :loading="removing === document.id"
            :aria-label="`Elimina ${document.title}`"
            @click="remove(document)"
          />
        </li>
      </ul>
    </IcSection>

    <IcSection title="Carica un documento" description="In PDF, fino a 15 MB.">
      <div class="space-y-5">
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Tipo di documento" required>
            <USelect v-model="upload.category" :items="categoryItems" class="w-full" />
          </UFormField>
          <UFormField label="Titolo" help="Per esempio: Attestato BLSD 2026." required>
            <UInput v-model="upload.title" :maxlength="150" class="w-full" />
          </UFormField>
        </div>
        <IcFileUpload
          :key="uploadKey"
          endpoint="/api/staff/documents"
          :fields="{ category: upload.category, title: upload.title.trim() }"
          :disabled="!upload.title.trim()"
          accept="application/pdf"
          description="PDF, fino a 15 MB"
          button-label="Carica il documento"
          :secondary="missing.length > 0"
          @uploaded="uploaded"
        />
        <p v-if="!upload.title.trim()" class="text-sm text-muted">Scrivi il titolo per poter caricare il file.</p>
      </div>
    </IcSection>
  </IcPage>
</template>
