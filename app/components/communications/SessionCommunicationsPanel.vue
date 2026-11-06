<script setup lang="ts">
// CONTRACT (docs/BUILD.md): owned by A5 Comunicazioni. Admin session page, tab "Comunicazioni": the
// emails of the session (automatic and manual) and a button to write to its families or staff.
defineProps<{ sessionId: string }>()
</script>

<template>
  <UEmpty
    icon="i-lucide-construction"
    title="In costruzione"
    description="Le comunicazioni arrivano con l’area Comunicazioni."
  />
</template>
