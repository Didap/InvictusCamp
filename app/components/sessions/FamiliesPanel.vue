<script setup lang="ts">
// CONTRACT (docs/BUILD.md): owned by A1 Sessioni. Admin session page, tab "Famiglie": slots, reserves,
// invitations, "chiama riserva". Props are final; the body is a placeholder until A1 replaces it.
defineProps<{ sessionId: string }>()
</script>

<template>
  <UEmpty
    icon="i-lucide-construction"
    title="In costruzione"
    description="Le famiglie della sessione arrivano con l’area Sessioni."
  />
</template>
