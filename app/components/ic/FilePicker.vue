<script setup lang="ts">
// The drop zone of one file, as v-model (a File or null); sending it is the caller's (IcFileUpload, or a
// form with more fields). On touch screens nothing can be dragged: the label only says to choose it.
withDefaults(defineProps<{ accept?: string; description?: string; disabled?: boolean }>(), {
  accept: 'application/pdf,image/jpeg,image/png',
  description: 'PDF, JPG o PNG, fino a 15 MB',
})
const file = defineModel<File | null>({ default: null })
const touch = useMediaQuery('(pointer: coarse)')
</script>

<template>
  <UFileUpload
    v-model="file"
    :accept="accept"
    :label="touch ? 'Scegli il file dal dispositivo' : 'Trascina qui il file o sceglilo dal dispositivo'"
    :description="description"
    :disabled="disabled"
    icon="i-lucide-upload"
    class="min-h-36 w-full"
  />
</template>
