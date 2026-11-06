<script setup lang="ts">
// CONTRACT (docs/BUILD.md): owned by A2 Staff. Admin session page, tab "Staff": convocations, staff
// available in the session dates, send convocation, contract status. Props are final.
defineProps<{ sessionId: string }>()
</script>

<template>
  <UEmpty
    icon="i-lucide-construction"
    title="In costruzione"
    description="Le convocazioni dello staff arrivano con l’area Staff."
  />
</template>
