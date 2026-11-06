<script setup lang="ts">
// Shows a PDF served by the API (same origin, session cookie), with a way out when the browser
// cannot display it inline (many phones).
defineProps<{ src: string; title: string }>()
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default bg-elevated">
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
</template>
