<script setup lang="ts">
import { MAX_UPLOAD_BYTES } from '#shared/utils/constants'

// Picks one file and posts it (multipart, field `file`) to `endpoint` with the extra `fields`.
// Emits `uploaded` with the server's answer. The server checks type and size again. On touch screens
// nothing can be dragged: `touchLabel` replaces `label` there.
const props = withDefaults(
  defineProps<{
    endpoint: string
    accept?: string
    fields?: Record<string, string | null | undefined>
    label?: string
    touchLabel?: string
    description?: string
    buttonLabel?: string
    disabled?: boolean
  }>(),
  {
    accept: 'application/pdf,image/jpeg,image/png',
    label: 'Trascina qui il file o sceglilo dal dispositivo',
    touchLabel: 'Scegli il file dal dispositivo',
    description: 'PDF, JPG o PNG, fino a 15 MB',
    buttonLabel: 'Carica',
  },
)
const emit = defineEmits<{ uploaded: [result: unknown] }>()

const touch = useMediaQuery('(pointer: coarse)')
const file = ref<File | null>(null)
const uploading = ref(false)
const api = useApi()

async function upload() {
  if (!file.value) return
  if (file.value.size > MAX_UPLOAD_BYTES) {
    notifyError({ data: { message: 'Il file supera 15 MB' } })
    return
  }
  const form = new FormData()
  form.append('file', file.value)
  for (const [key, value] of Object.entries(props.fields ?? {})) {
    if (value !== null && value !== undefined) form.append(key, value)
  }
  uploading.value = true
  try {
    const result = await api(props.endpoint, { method: 'POST', body: form })
    file.value = null
    notifySuccess('File caricato')
    emit('uploaded', result)
  } catch (error) {
    notifyError(error, 'Caricamento non riuscito')
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <UFileUpload
      v-model="file"
      :accept="accept"
      :label="touch ? touchLabel : label"
      :description="description"
      :disabled="disabled || uploading"
      icon="i-lucide-upload"
      class="min-h-36 w-full"
    />
    <div class="flex justify-end">
      <UButton
        :disabled="!file || disabled"
        :loading="uploading"
        icon="i-lucide-upload"
        :label="buttonLabel"
        class="pointer-coarse:min-h-11"
        @click="upload"
      />
    </div>
  </div>
</template>
