<script setup lang="ts">
import { MAX_UPLOAD_BYTES } from '#shared/utils/constants'

// Picks one file and posts it (multipart, field `file`) to `endpoint` with the extra `fields`.
// Emits `uploaded` with the server's answer. The server checks type and size again.
const props = withDefaults(
  defineProps<{
    endpoint: string
    accept?: string
    fields?: Record<string, string | null | undefined>
    description?: string
    buttonLabel?: string
    disabled?: boolean
    /** Not the primary action of the page: a neutral button. */
    secondary?: boolean
  }>(),
  {
    accept: 'application/pdf,image/jpeg,image/png',
    description: 'PDF, JPG o PNG, fino a 15 MB',
    buttonLabel: 'Carica',
  },
)
const emit = defineEmits<{ uploaded: [result: unknown] }>()

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
    <IcFilePicker v-model="file" :accept="accept" :description="description" :disabled="disabled || uploading" />
    <div class="flex justify-end">
      <UButton
        :disabled="!file || disabled"
        :loading="uploading"
        icon="i-lucide-upload"
        :label="buttonLabel"
        :color="secondary ? 'neutral' : 'primary'"
        :variant="secondary ? 'outline' : 'solid'"
        class="pointer-coarse:min-h-11"
        @click="upload"
      />
    </div>
  </div>
</template>
