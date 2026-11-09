<script setup lang="ts">
// The programme of a session the family is invited to or confirmed in (`id` is the session).
const route = useRoute()
const url = computed(() => `/api/family/sessions/${String(route.params.id)}/programme`)
</script>

<template>
  <ProgrammeSessionView :url="url" back="/famiglia/sessioni" />
</template>
