<script setup lang="ts">
// Feedback (docs/spec.md 3.13): what the families said at the end of their session, year by year.
const route = useRoute()
const router = useRouter()
const { data: years, status, refresh } = useApiFetch<number[]>('/api/admin/feedback')

const year = computed({
  get: () => {
    const asked = Number(route.query.anno)
    return years.value?.includes(asked) ? asked : years.value?.[0]
  },
  set: value => router.replace({ query: { ...route.query, anno: value === years.value?.[0] ? undefined : value } }),
})
const yearItems = computed(() => (years.value ?? []).map(y => ({ label: String(y), value: y })))
</script>

<template>
  <IcPage title="Feedback" description="Cosa hanno detto le famiglie alla fine della loro sessione.">
    <template v-if="yearItems.length > 1" #actions>
      <USelect v-model="year" :items="yearItems" aria-label="Anno" class="w-28" />
    </template>

    <USkeleton v-if="status === 'pending' && !years" class="h-40 w-full" />
    <UAlert
      v-else-if="!years"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare il feedback"
      description="Controlla la connessione e riprova."
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />
    <UAlert
      v-else-if="!year"
      icon="i-lucide-message-square-heart"
      color="neutral"
      variant="subtle"
      title="Ancora nessun feedback"
      description="Qui arriveranno i questionari di fine sessione delle famiglie."
    />
    <FeedbackYearView v-else :key="year" :year="year" />
  </IcPage>
</template>
