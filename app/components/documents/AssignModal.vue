<script setup lang="ts">
import type { AssignResult, AssignTarget, AssignTargetType, DocumentOptions } from '#shared/types/documents'
import { enumLabel } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDayRange, plural } from '#shared/utils/format'

// Assigns a document (docs/spec.md 3.6): to chosen people, all families, all approved staff, the
// families or the staff of a session; optional due date. The numbers come from a dry run, and the
// confirmation says how many emails leave. Fixed parts: `documentId` (the document page), `userIds`
// (an account page), `sessionId` (the Documenti tab of a session: its families or its staff only).
const props = defineProps<{
  documentId?: string
  userIds?: string[]
  /** Who `userIds` are, for the sentence of the dialog. */
  peopleLabel?: string
  sessionId?: string
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ assigned: [result: AssignResult] }>()

const api = useApi()
const confirm = useConfirm()
const { data: options, refresh: refreshOptions } = useApiFetch<DocumentOptions>('/api/admin/documents/options', {
  key: 'document-options',
  lazy: true,
})

const state = reactive({
  documentId: '',
  type: 'users' as AssignTargetType,
  userIds: [] as string[],
  sessionId: '',
  dueDate: '',
})
const preview = ref<AssignResult | null>(null)
const previewError = ref('')
const previewing = ref(false)
const saving = ref(false)
const documentError = ref('')

watch(
  open,
  value => {
    if (!value) return
    refreshOptions()
    Object.assign(state, {
      documentId: '',
      type: props.sessionId ? 'session_families' : 'users',
      userIds: [],
      sessionId: props.sessionId ?? '',
      dueDate: '',
    })
    preview.value = null
    previewError.value = ''
    documentError.value = ''
  },
  { immediate: true },
)

const documentId = computed(() => props.documentId ?? state.documentId)
const chosenDocument = computed(() => options.value?.documents.find(d => d.id === documentId.value))
const fixedPeople = computed(() => {
  if (props.peopleLabel || !props.userIds) return props.peopleLabel
  const person = props.userIds.length === 1 ? options.value?.people.find(p => p.id === props.userIds![0]) : undefined
  return person ? (person.familyName ? `${person.familyName} (${person.name})` : person.name) : undefined
})
const verb = computed(() => (chosenDocument.value?.requiresSignature === false ? 'leggere' : 'firmare'))

const target = computed<AssignTarget | null>(() => {
  if (props.userIds) return { type: 'users', userIds: props.userIds }
  switch (state.type) {
    case 'users':
      return state.userIds.length ? { type: 'users', userIds: state.userIds } : null
    case 'all_families':
      return { type: 'all_families' }
    case 'all_staff':
      return { type: 'all_staff' }
    default:
      return state.sessionId ? { type: state.type, sessionId: state.sessionId } : null
  }
})

const typeItems = computed(() => {
  const session = [
    {
      value: 'session_families',
      label: props.sessionId ? 'Le famiglie della sessione' : 'Le famiglie di una sessione',
      description: 'Le titolari invitate o che hanno confermato.',
    },
    {
      value: 'session_staff',
      label: props.sessionId ? 'Lo staff della sessione' : 'Lo staff di una sessione',
      description: 'Chi ha accettato la convocazione.',
    },
  ]
  if (props.sessionId) return session
  return [
    { value: 'users', label: 'Persone scelte', description: 'Famiglie o membri dello staff, uno per uno.' },
    { value: 'all_families', label: 'Tutte le famiglie', description: 'Ogni account famiglia attivo.' },
    { value: 'all_staff', label: 'Tutto lo staff approvato', description: 'Chi ha la candidatura approvata.' },
    ...session,
  ]
})

const documentItems = computed(() =>
  [...(options.value?.documents ?? [])]
    .sort((a, b) => Number(b.sessionId === props.sessionId) - Number(a.sessionId === props.sessionId))
    .map(d => ({ label: d.title, value: d.id, description: d.requiresSignature ? 'Da firmare' : 'Da leggere' })),
)
const peopleItems = computed(() =>
  (options.value?.people ?? []).map(p => ({
    label: p.familyName ? `${p.familyName} (${p.name})` : p.name,
    value: p.id,
    description: `${enumLabel('userRole', p.role)}, ${p.email}`,
  })),
)
const sessionItems = computed(() =>
  (options.value?.sessions ?? []).map(s => ({
    label: `${s.title} (${formatDayRange(s.startDate, s.endDate)})`,
    value: s.id,
  })),
)

async function refreshPreview() {
  previewError.value = ''
  if (!open.value || !documentId.value || !target.value) {
    preview.value = null
    return
  }
  previewing.value = true
  try {
    preview.value = await api<AssignResult>(`/api/admin/documents/${documentId.value}/assign`, {
      method: 'POST',
      body: { target: target.value, dryRun: true },
    })
  } catch (error) {
    preview.value = null
    previewError.value = apiErrorMessage(error)
  } finally {
    previewing.value = false
  }
}
watchDebounced([target, documentId, open], refreshPreview, { debounce: 250, deep: true, immediate: true })

const summary = computed(() => {
  const p = preview.value
  if (!p) return ''
  if (!p.recipients) {
    return props.userIds
      ? 'L’account non è attivo: potrà ricevere documenti quando avrà scelto la password o sarà riattivato.'
      : 'Nessuna persona corrisponde a questa scelta.'
  }
  const parts = [plural(p.recipients, 'persona', 'persone')]
  if (p.alreadyAssigned) {
    parts.push(
      p.alreadyAssigned === 1
        ? '1 ha già il documento e non riceve nulla'
        : `${p.alreadyAssigned} lo hanno già e non ricevono nulla`,
    )
  }
  if (!p.created) return `${parts.join(', ')}. Tutte hanno già il documento: non parte nessuna email.`
  return `${parts.join(', ')}. ${p.created === 1 ? 'Partirà 1 email' : `Partiranno ${p.created} email`}.`
})

async function submit() {
  documentError.value = documentId.value ? '' : 'Scegli il documento da assegnare'
  if (!documentId.value || !target.value) return
  await refreshPreview()
  const count = preview.value?.created ?? 0
  if (!count) return
  const ok = await confirm({
    title: 'Assegnare il documento?',
    description: `${count === 1 ? 'Partirà 1 email' : `Partiranno ${count} email`} con il link per ${verb.value} «${chosenDocument.value?.title ?? 'il documento'}».`,
    confirmLabel: count === 1 ? 'Invia 1 email' : `Invia ${count} email`,
  })
  if (!ok) return
  saving.value = true
  try {
    const result = await api<AssignResult>(`/api/admin/documents/${documentId.value}/assign`, {
      method: 'POST',
      body: { target: target.value, dueDate: state.dueDate || null },
    })
    notifySuccess(
      'Documento assegnato',
      result.created === 1 ? 'È partita 1 email.' : `Sono partite ${result.created} email.`,
    )
    emit('assigned', result)
    open.value = false
  } catch (error) {
    notifyError(error, 'Assegnazione non riuscita')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Assegna il documento"
    :description="
      userIds
        ? `Chiedi a ${fixedPeople ?? 'questa persona'} di firmare o leggere un documento.`
        : 'Scegli chi deve firmarlo o leggerlo. Ognuno riceve un’email con il link.'
    "
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <form class="space-y-5" @submit.prevent="submit">
        <UFormField v-if="!props.documentId" label="Documento" :error="documentError || undefined" required>
          <USelectMenu
            v-model="state.documentId"
            :items="documentItems"
            value-key="value"
            placeholder="Scegli un documento"
            :search-input="{ placeholder: 'Cerca un documento' }"
            class="w-full"
          />
          <template v-if="!documentItems.length && options" #help>
            Non ci sono documenti in uso: caricane uno dalla pagina Documenti.
          </template>
        </UFormField>

        <UFormField v-if="!userIds" label="A chi" required>
          <URadioGroup v-model="state.type" :items="typeItems" variant="card" class="w-full" />
        </UFormField>

        <UFormField v-if="!userIds && state.type === 'users'" label="Persone" required>
          <USelectMenu
            v-model="state.userIds"
            :items="peopleItems"
            value-key="value"
            multiple
            :filter-fields="['label', 'description']"
            placeholder="Cerca per nome, famiglia o email"
            :search-input="{ placeholder: 'Cerca per nome, famiglia o email' }"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="!userIds && !sessionId && (state.type === 'session_families' || state.type === 'session_staff')"
          label="Sessione"
          required
        >
          <USelect v-model="state.sessionId" :items="sessionItems" placeholder="Scegli una sessione" class="w-full" />
        </UFormField>

        <UFormField
          :label="`Da ${verb} entro`"
          hint="Facoltativa"
          help="La data compare nell’email e nella pagina di firma."
        >
          <UInput v-model="state.dueDate" type="date" :min="todayIso()" class="w-full sm:w-56" />
        </UFormField>

        <p
          v-if="previewing || summary || previewError"
          class="flex items-start gap-2 rounded-md bg-muted px-3 py-2.5 text-sm"
          :class="previewError ? 'text-error' : 'text-default'"
          aria-live="polite"
        >
          <UIcon
            :name="previewError ? 'i-lucide-circle-alert' : 'i-lucide-mail'"
            class="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span>{{ previewError || (previewing && !summary ? 'Conto i destinatari' : summary) }}</span>
        </p>

        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="Annulla" @click="open = false" />
          <UButton
            type="submit"
            icon="i-lucide-send"
            :loading="saving"
            :disabled="!target || !documentId || !preview?.created"
            :label="
              preview?.created
                ? `Assegna e invia ${preview.created === 1 ? '1 email' : `${preview.created} email`}`
                : 'Assegna'
            "
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
