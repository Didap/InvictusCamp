<script setup lang="ts">
import type { FeedbackArchive } from '#shared/types/feedback'

// One year of feedback in three tabs (docs/spec.md 3.13); the tab lives in the address (?vista=).
const props = defineProps<{ year: number }>()
const route = useRoute()
const router = useRouter()

const { data: archive, status } = useApiFetch<FeedbackArchive>(() => `/api/admin/feedback/${props.year}`)

const TABS = [
  { label: 'Voti', value: 'voti', icon: 'i-lucide-chart-bar' },
  { label: 'Commenti', value: 'commenti', icon: 'i-lucide-message-square-quote' },
  { label: 'Staff', value: 'staff', icon: 'i-lucide-id-card' },
]
const tab = computed({
  get: () => (TABS.some(t => t.value === route.query.vista) ? String(route.query.vista) : 'voti'),
  set: value => router.replace({ query: { ...route.query, vista: value === 'voti' ? undefined : value } }),
})
</script>

<template>
  <div>
    <UTabs v-model="tab" :items="TABS" :content="false" variant="link" class="mb-8" />
    <p v-if="status === 'pending' && !archive" class="text-muted">Carico il feedback del {{ year }}…</p>
    <template v-else-if="archive">
      <FeedbackVotes v-if="tab === 'voti'" :archive="archive" />
      <FeedbackComments v-else-if="tab === 'commenti'" :archive="archive" />
      <FeedbackStaff v-else :archive="archive" />
    </template>
  </div>
</template>
