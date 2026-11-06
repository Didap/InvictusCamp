<script setup lang="ts">
import { documentFieldsSchema, type DocumentFieldsInput } from '#shared/schemas/documents'
import type { DocumentDetail, DocumentOptions } from '#shared/types/documents'
import { formatDayRange } from '#shared/utils/format'

// Uploads a PDF with its details, or edits the details of `document`. v-model:open; emits `saved`
// with the id. `sessionId` preselects the session (the Documenti tab of a session).
const props = defineProps<{ document?: DocumentDetail; sessionId?: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [id: string] }>()

const api = useApi()
const { options: enumOptions } = useEnums()
const { data: options } = useApiFetch<DocumentOptions>('/api/admin/documents/options', {
  key: 'document-options',
  lazy: true,
})

const NO_SESSION = 'none'
const state = reactive<DocumentFieldsInput>({
  title: '',
  category: 'regulation',
  description: '',
  requiresSignature: true,
  sessionId: null,
})
const sessionChoice = ref(NO_SESSION)
const kind = computed({
  get: () => (state.requiresSignature ? 'sign' : 'read'),
  set: (value: string) => {
    state.requiresSignature = value === 'sign'
  },
})
const file = ref<File | null>(null)
const fileError = ref('')
const saving = ref(false)

watch(
  open,
  value => {
    if (!value) return
    const d = props.document
    Object.assign(state, {
      title: d?.title ?? '',
      category: d?.category ?? 'regulation',
      description: d?.description ?? '',
      requiresSignature: d?.requiresSignature ?? true,
    })
    sessionChoice.value = d ? (d.session?.id ?? NO_SESSION) : (props.sessionId ?? NO_SESSION)
    file.value = null
    fileError.value = ''
  },
  { immediate: true },
)

watch(file, value => {
  if (value) fileError.value = ''
  if (value && !state.title.trim()) {
    state.title = value.name
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .slice(0, 200)
  }
})

const categoryItems = computed(() => enumOptions('documentCategory'))
const sessionItems = computed(() => [
  { label: 'Nessuna sessione', value: NO_SESSION },
  ...(options.value?.sessions ?? []).map(s => ({
    label: `${s.title} (${formatDayRange(s.startDate, s.endDate)})`,
    value: s.id,
  })),
])
const kindItems = [
  {
    value: 'sign',
    label: 'Da firmare',
    description: 'Chi lo riceve lo firma con un codice che arriva via email.',
  },
  { value: 'read', label: 'Da leggere', description: 'Chi lo riceve conferma soltanto di averlo letto.' },
]
const signLocked = computed(() => !!props.document?.locked)

async function submit() {
  if (!props.document && !file.value) {
    fileError.value = 'Scegli il file PDF da caricare'
    return
  }
  const fields = { ...state, sessionId: sessionChoice.value === NO_SESSION ? null : sessionChoice.value }
  saving.value = true
  try {
    if (props.document) {
      // A plain string: the typed $fetch cannot tell this template path from /options (GET only).
      const url: string = `/api/admin/documents/${props.document.id}`
      await api(url, { method: 'PATCH', body: fields })
      notifySuccess('Documento aggiornato')
      emit('saved', props.document.id)
    } else {
      const body = new FormData()
      body.append('file', file.value!)
      body.append('title', fields.title)
      body.append('category', fields.category)
      body.append('description', fields.description ?? '')
      body.append('requiresSignature', String(fields.requiresSignature))
      body.append('sessionId', fields.sessionId ?? '')
      const { id } = await api<{ id: string }>('/api/admin/documents', { method: 'POST', body })
      notifySuccess(
        'Documento caricato',
        `Ora puoi assegnarlo alle persone che devono ${fields.requiresSignature ? 'firmarlo' : 'leggerlo'}.`,
      )
      emit('saved', id)
    }
    open.value = false
  } catch (error) {
    notifyError(error, props.document ? 'Modifica non riuscita' : 'Caricamento non riuscito')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="document ? 'Modifica il documento' : 'Carica un documento'"
    :description="
      document
        ? 'Cambia titolo, categoria, descrizione o sessione.'
        : 'Un PDF da far firmare o leggere a famiglie e staff. Dopo il caricamento scegli a chi assegnarlo.'
    "
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UForm :schema="documentFieldsSchema" :state="state" class="space-y-5" @submit="submit">
        <UFormField v-if="!document" label="File PDF" name="file" :error="fileError || undefined" required>
          <UFileUpload
            v-model="file"
            accept="application/pdf"
            label="Trascina qui il PDF o sceglilo dal dispositivo"
            description="Solo PDF, fino a 15 MB"
            icon="i-lucide-file-up"
            class="min-h-32 w-full"
          />
        </UFormField>
        <UFormField label="Titolo" name="title" required>
          <UInput v-model="state.title" class="w-full" />
        </UFormField>
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Categoria" name="category" required>
            <USelect v-model="state.category" :items="categoryItems" class="w-full" />
          </UFormField>
          <UFormField label="Sessione" name="sessionId" hint="Facoltativa">
            <USelect v-model="sessionChoice" :items="sessionItems" class="w-full" />
          </UFormField>
        </div>
        <UFormField
          label="Descrizione"
          name="description"
          hint="Facoltativa"
          help="La legge chi firma, sopra il documento."
        >
          <UTextarea v-model="state.description" :rows="3" autoresize class="w-full" />
        </UFormField>
        <UFormField
          label="Cosa deve fare chi lo riceve"
          name="requiresSignature"
          :help="signLocked ? 'Qualcuno lo ha già firmato o letto: non si può più cambiare.' : undefined"
          required
        >
          <URadioGroup v-model="kind" :items="kindItems" variant="card" :disabled="signLocked" class="w-full" />
        </UFormField>
        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="Annulla" @click="open = false" />
          <UButton
            type="submit"
            :loading="saving"
            :icon="document ? 'i-lucide-check' : 'i-lucide-upload'"
            :label="document ? 'Salva' : 'Carica il documento'"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
