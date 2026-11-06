<script setup lang="ts">
import { STAFF_DOCUMENT_CATEGORIES } from '#shared/schemas/staff'
import type { StaffDocumentDto } from '#shared/types/staff'
import type { PersonalDocumentCategory } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDay } from '#shared/utils/format'

// Documents: what the administration asks to sign (PendingSignatures, documents area) and the personal
// documents the person uploads (titles, certificates, ID), each with a category and a title.
const api = useApi()
const confirm = useConfirm()
const { label, options } = useEnums()
const { data, refresh } = await useApiFetch<StaffDocumentDto[]>('/api/staff/documents')
const documents = computed(() => data.value ?? [])

const categoryItems = computed(() =>
  options('personalDocumentCategory', STAFF_DOCUMENT_CATEGORIES).map(option => ({
    label: option.label,
    value: option.value as PersonalDocumentCategory,
  })),
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
    <IcSection title="Da firmare" description="I documenti che l’amministrazione ti chiede di leggere e firmare.">
      <DocumentsPendingSignatures />
    </IcSection>

    <IcSection
      title="I tuoi documenti"
      description="Titoli, attestati, certificati e documento d’identità che vuoi condividere con l’amministrazione."
    >
      <p v-if="!documents.length" class="text-muted">Non hai ancora caricato documenti.</p>
      <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li
          v-for="document in documents"
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
