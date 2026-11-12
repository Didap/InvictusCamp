<script setup lang="ts">
import type { FeedbackYear } from '#shared/types/feedback'

// Feedback (docs/spec.md 3.13): what the families said at the end of their session, year by year.
const route = useRoute()
const router = useRouter()
const { data: years, status } = useApiFetch<FeedbackYear[]>('/api/admin/feedback')

const year = computed({
  get: () => {
    const asked = Number(route.query.anno)
    return years.value?.some(y => y.year === asked) ? asked : years.value?.[0]?.year
  },
  set: value =>
    router.replace({ query: { ...route.query, anno: value === years.value?.[0]?.year ? undefined : value } }),
})
const yearItems = computed(() => (years.value ?? []).map(y => ({ label: String(y.year), value: y.year })))
</script>

<template>
  <IcPage title="Feedback" description="Cosa hanno detto le famiglie alla fine della loro sessione.">
    <template v-if="yearItems.length > 1" #actions>
      <USelect v-model="year" :items="yearItems" aria-label="Anno" class="w-28" />
    </template>

    <p v-if="status === 'pending' && !years" class="text-muted">Carico…</p>
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
