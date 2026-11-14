<script setup lang="ts">
import type { FeedbackArchive } from '#shared/types/feedback'

// One year of feedback in three tabs (docs/spec.md 3.13); the tab lives in the address (?vista=).
const props = defineProps<{ year: number }>()
const route = useRoute()
const router = useRouter()

const { data: archive, status, refresh } = useApiFetch<FeedbackArchive>(() => `/api/admin/feedback/${props.year}`)

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
    <USkeleton v-if="status === 'pending' && !archive" class="h-40 w-full" />
    <UAlert
      v-else-if="!archive"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="`Non riesco a caricare il feedback del ${year}`"
      description="Controlla la connessione e riprova."
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />
    <FeedbackVotes v-else-if="tab === 'voti'" :archive="archive" />
    <FeedbackComments v-else-if="tab === 'commenti'" :archive="archive" />
    <FeedbackStaff v-else :archive="archive" />
  </div>
</template>
