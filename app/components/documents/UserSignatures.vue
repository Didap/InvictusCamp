<script setup lang="ts">
// CONTRACT (docs/BUILD.md): owned by A4 Documenti. Admin family and staff pages: the documents assigned
// to one account, with status, reminder and signed copy. Props are final.
defineProps<{ userId: string }>()
</script>

<template>
  <UEmpty icon="i-lucide-construction" title="In costruzione" description="Le firme arrivano con l’area Documenti." />
</template>
