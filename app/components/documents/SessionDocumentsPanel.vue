<script setup lang="ts">
// CONTRACT (docs/BUILD.md): owned by A4 Documenti. Admin session page, tab "Documenti": documents of the
// session, assign to its families or staff, signature progress. Props are final.
defineProps<{ sessionId: string }>()
</script>

<template>
  <UEmpty
    icon="i-lucide-construction"
    title="In costruzione"
    description="I documenti della sessione arrivano con l’area Documenti."
  />
</template>
