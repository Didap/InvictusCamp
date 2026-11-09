<script setup lang="ts">
import type { FileDto } from '#shared/types/api'
import { formatBytes } from '#shared/utils/format'

// A stored file: opens inline in a new tab, with a download button. `href` overrides the default
// endpoint (GET /api/files/:id) for files served by an area endpoint.
const props = defineProps<{
  file: Pick<FileDto, 'id' | 'originalName' | 'mimeType' | 'sizeBytes'>
  href?: string
  label?: string
}>()
const url = computed(() => props.href ?? `/api/files/${props.file.id}`)
const downloadUrl = computed(() => `${url.value}${url.value.includes('?') ? '&' : '?'}download`)
const icon = computed(() => (props.file.mimeType === 'application/pdf' ? 'i-lucide-file-text' : 'i-lucide-image'))
</script>

<template>
  <div class="flex min-w-0 items-center gap-3">
    <UIcon :name="icon" class="size-5 shrink-0 text-muted" aria-hidden="true" />
    <a :href="url" target="_blank" rel="noopener" class="truncate font-semibold text-primary hover:underline">
      {{ label ?? file.originalName }}
    </a>
    <span class="shrink-0 text-sm text-muted tabular-nums">{{ formatBytes(file.sizeBytes) }}</span>
    <UButton
      :href="downloadUrl"
      external
      icon="i-lucide-download"
      color="neutral"
      variant="ghost"
      size="sm"
      :aria-label="`Scarica ${label ?? file.originalName}`"
    />
  </div>
</template>
