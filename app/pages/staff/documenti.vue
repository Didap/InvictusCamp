<script setup lang="ts">
import { REQUIRED_DOCUMENT_NAMES, STAFF_DOCUMENT_CATEGORIES, missingStaffDocuments } from '#shared/schemas/staff'
import type { MyStaffDocuments, StaffDocumentDto } from '#shared/types/staff'
import type { PersonalDocumentCategory } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { andList, formatDay } from '#shared/utils/format'

// Documents (spec 3.4): the required ones first, the CV and an ID in PDF; what the administration asks to sign
// (PendingSignatures, documents area); the other personal documents (titles, certificates), each with a category
// and a title.
const api = useApi()
const confirm = useConfirm()
const { label, options } = useEnums()
const { data, refresh } = await useApiFetch<MyStaffDocuments>('/api/staff/documents')
const documents = computed(() => data.value?.documents ?? [])
const idDocuments = computed(() => documents.value.filter(document => document.category === 'id_document'))
const others = computed(() => documents.value.filter(document => document.category !== 'id_document'))
const missing = computed(() =>
  data.value
    ? missingStaffDocuments(
        data.value.cv !== null,
        documents.value.map(document => document.category),
      )
    : [],
)

/** The ID has its own place among the required documents. */
const categoryItems = computed(() =>
  options(
    'personalDocumentCategory',
    STAFF_DOCUMENT_CATEGORIES.filter(category => category !== 'id_document'),
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
    title: `Elimini «${document.title}»?`,
    description: 'Il file viene cancellato e l’amministrazione non lo vede più.',
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
          ? `Ci servono per lavorare con te: carica ${andList(missing.map(m => REQUIRED_DOCUMENT_NAMES[m]))}, in PDF.`
          : 'Il curriculum e il documento d’identità, in PDF: ci sono tutti e due.'
      "
    >
      <div class="space-y-6">
        <div>
          <h3 class="font-semibold text-highlighted">Curriculum</h3>
          <IcFileLink v-if="data.cv" :file="data.cv" class="mt-2" />
          <p v-else class="mt-1 text-warning">Da caricare</p>
          <IcFileUpload
            class="mt-3"
            endpoint="/api/staff/cv"
            accept="application/pdf"
            description="PDF, fino a 15 MB"
            :button-label="data.cv ? 'Sostituisci il CV' : 'Carica il CV'"
            @uploaded="refresh()"
          />
        </div>
        <div>
          <h3 class="font-semibold text-highlighted">Documento d’identità</h3>
          <ul v-if="idDocuments.length" class="mt-2 space-y-2">
            <li v-for="document in idDocuments" :key="document.id" class="flex flex-wrap items-center gap-x-4 gap-y-1">
              <IcFileLink :file="document.file" :label="document.title" />
              <UButton
                class="pointer-coarse:min-h-11"
                icon="i-lucide-trash-2"
                label="Elimina"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="removing === document.id"
                :aria-label="`Elimina ${document.title}`"
                @click="remove(document)"
              />
            </li>
          </ul>
          <p v-else class="mt-1 text-warning">Da caricare</p>
          <IcFileUpload
            class="mt-3"
            endpoint="/api/staff/documents"
            accept="application/pdf"
            description="PDF con fronte e retro, fino a 15 MB"
            :fields="{ category: 'id_document', title: 'Documento d’identità' }"
            :button-label="idDocuments.length ? 'Carica un altro documento' : 'Carica il documento'"
            @uploaded="refresh()"
          />
        </div>
      </div>
    </IcSection>

    <IcSection title="Da firmare" description="I documenti che l’amministrazione ti chiede di leggere e firmare.">
      <DocumentsPendingSignatures />
    </IcSection>

    <IcSection
      title="I tuoi documenti"
      description="Titoli, attestati e certificati che vuoi condividere con l’amministrazione."
    >
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

    <IcSection title="Carica un documento" description="PDF, JPG o PNG, fino a 15 MB.">
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
          button-label="Carica il documento"
          @uploaded="uploaded"
        />
        <p v-if="!upload.title.trim()" class="text-sm text-muted">Scrivi il titolo per poter caricare il file.</p>
      </div>
    </IcSection>
  </IcPage>
</template>
