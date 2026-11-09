<script setup lang="ts">
// The programme of a session whose convocation the person accepted (`id` is the session).
const route = useRoute()
const url = computed(() => `/api/staff/programmes/${String(route.params.id)}`)
</script>

<template>
  <ProgrammeSessionView :url="url" back="/staff/sessioni" />
</template>
