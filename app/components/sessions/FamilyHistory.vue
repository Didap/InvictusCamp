<script setup lang="ts">
// CONTRACT (docs/BUILD.md): owned by A1 Sessioni. Admin family page: the sessions of one family
// (kind, status, dates) with links to each session. Props are final.
defineProps<{ familyId: string }>()
</script>

<template>
  <UEmpty
    icon="i-lucide-construction"
    title="In costruzione"
    description="Lo storico delle sessioni arriva con l’area Sessioni."
  />
</template>
