<script setup lang="ts">
import { z } from 'zod'
import { isHealthDocument, personalDocumentSchema } from '#shared/schemas/families'
import type { FamilyMemberDto } from '#shared/types/families'
import {
  MAX_UPLOAD_BYTES,
  PERSONAL_DOCUMENT_CATEGORIES,
  enumLabel,
  type PersonalDocumentCategory,
} from '#shared/utils/constants'
import { fullName, isEmptyCard } from '#shared/utils/format'

// Upload of a personal document of the family: type, title, who it refers to, the file (PDF, JPG or
// PNG up to 15 MB). Certificates and diagnoses are offered only with the consent to health data. The
// server checks type, size, consent and the member again.
const props = defineProps<{
  members: FamilyMemberDto[]
  healthConsent: boolean
  /** Type and person already chosen, as the «Carica il documento di identità» of a member. */
  preset?: { category: PersonalDocumentCategory; member: string }
}>()
const emit = defineEmits<{ uploaded: [] }>()

const WHOLE_FAMILY = 'family'
const schema = personalDocumentSchema.omit({ familyMemberId: true }).extend({
  member: z.string(),
  file: z
    .instanceof(File, { error: 'Scegli il file da caricare' })
    .refine(file => file.size <= MAX_UPLOAD_BYTES, { error: 'Il file supera 15 MB' }),
})

const blank = () => ({
  category: props.preset?.category,
  title: '',
  member: props.preset?.member ?? WHOLE_FAMILY,
  file: null,
})
const state = reactive<{
  category: PersonalDocumentCategory | undefined
  title: string
  member: string
  file: File | null
}>(blank())

const { options } = useEnums()
const categories = computed(() =>
  options(
    'personalDocumentCategory',
    props.healthConsent ? undefined : PERSONAL_DOCUMENT_CATEGORIES.filter(category => !isHealthDocument(category)),
  ),
)
// Nothing to drag on a touch screen: the drop zone only opens the file picker there.
const touch = useMediaQuery('(pointer: coarse)')
const memberItems = computed(() => [
  { value: WHOLE_FAMILY, label: 'Tutta la famiglia' },
  // A card still to fill in has no name to put on a document.
  ...props.members
    .filter(member => !isEmptyCard(member))
    .map(member => ({ value: member.id, label: fullName(member) })),
])

// A title written for you from the type and the person, until you write your own.
let suggested = ''
watch(
  () => [state.category, state.member] as const,
  ([category, memberId]) => {
    if (!category || (state.title && state.title !== suggested)) return
    const member = props.members.find(m => m.id === memberId)
    suggested = `${enumLabel('personalDocumentCategory', category)}${member ? ` di ${member.firstName}` : ''}`
    state.title = suggested
  },
  { immediate: true },
)

const api = useApi()
const uploading = ref(false)

async function upload() {
  if (!state.file || !state.category) return
  const form = new FormData()
  form.append('file', state.file)
  form.append('category', state.category)
  form.append('title', state.title)
  if (state.member !== WHOLE_FAMILY) form.append('familyMemberId', state.member)
  uploading.value = true
  try {
    await api('/api/family/documents', { method: 'POST', body: form })
    notifySuccess('Documento caricato', state.title)
    suggested = ''
    Object.assign(state, blank())
    emit('uploaded')
  } catch (error) {
    notifyError(error, 'Caricamento non riuscito')
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-5" @submit="upload">
    <div class="grid gap-5 sm:grid-cols-2">
      <UFormField label="Tipo di documento" name="category" required>
        <USelect v-model="state.category" :items="categories" value-key="value" placeholder="Scegli" class="w-full" />
        <template v-if="!healthConsent" #help>
          Per certificati medici e diagnosi serve il
          <ULink to="/famiglia/membri#consenso" class="font-semibold text-primary underline"
            >consenso ai dati sulla salute</ULink
          >.
        </template>
      </UFormField>
      <UFormField label="Riguarda" name="member">
        <USelect v-model="state.member" :items="memberItems" value-key="value" class="w-full" />
      </UFormField>
    </div>
    <UFormField
      label="Titolo"
      name="title"
      required
      help="Per riconoscerlo nell’elenco, per esempio «Certificato medico 2027»."
    >
      <UInput v-model="state.title" class="w-full" />
    </UFormField>
    <UFormField label="File" name="file" required>
      <UFileUpload
        v-model="state.file"
        accept="application/pdf,image/jpeg,image/png"
        :label="touch ? 'Scegli il file dal dispositivo' : 'Trascina qui il file o sceglilo dal dispositivo'"
        description="PDF, JPG o PNG, fino a 15 MB"
        icon="i-lucide-upload"
        :disabled="uploading"
        class="min-h-36 w-full"
      />
    </UFormField>
    <div class="flex justify-end">
      <UButton
        type="submit"
        icon="i-lucide-upload"
        label="Carica il documento"
        class="pointer-coarse:min-h-11"
        :loading="uploading"
      />
    </div>
  </UForm>
</template>
