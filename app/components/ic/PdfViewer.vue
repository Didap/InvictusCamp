<script setup lang="ts">
// Shows a PDF served by the API (same origin, session cookie). On phones a frame is mostly blank or too
// small to read, so below the sm breakpoint there is no frame: a file card opens the PDF in a new tab.
defineProps<{ src: string; title: string }>()
const wide = useMediaQuery('(min-width: 40rem)')
</script>

<template>
  <div v-if="wide" class="overflow-hidden rounded-lg border border-default bg-elevated">
    <iframe :src="src" :title="title" class="block h-[70vh] w-full bg-white" />
    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-default px-4 py-2 text-sm">
      <span class="text-muted">Non vedi il documento?</span>
      <UButton
        :href="src"
        external
        target="_blank"
        variant="link"
        icon="i-lucide-external-link"
        label="Aprilo in una nuova scheda"
      />
    </div>
  </div>

  <div v-else class="rounded-lg border border-default bg-elevated p-4">
    <div class="flex items-start gap-3">
      <UIcon name="i-lucide-file-text" class="size-8 shrink-0 text-muted" aria-hidden="true" />
      <div class="min-w-0">
        <p class="font-semibold break-words text-highlighted">{{ title }}</p>
        <p class="text-sm text-muted">PDF, si apre in una nuova scheda.</p>
      </div>
    </div>
    <UButton
      :href="src"
      external
      target="_blank"
      size="lg"
      color="neutral"
      variant="outline"
      icon="i-lucide-external-link"
      label="Apri il documento"
      block
      class="mt-4 min-h-11"
    />
  </div>
</template>
