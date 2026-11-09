<script setup lang="ts">
// The programme of a session whose convocation the person accepted (`id` is the session).
const route = useRoute()
const url = computed(() => `/api/staff/sessions/${String(route.params.id)}/programme`)
</script>

<template>
  <ProgrammeSessionView :url="url" back="/staff/sessioni" />
</template>
