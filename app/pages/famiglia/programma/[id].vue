<script setup lang="ts">
// The programme of a session the family is invited to or confirmed in (`id` is the session).
const route = useRoute()
const url = computed(() => `/api/family/programmes/${String(route.params.id)}`)
</script>

<template>
  <ProgrammeSessionView :url="url" back="/famiglia/sessioni" />
</template>
