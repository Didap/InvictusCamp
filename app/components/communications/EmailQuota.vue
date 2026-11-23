<script setup lang="ts">
import type { EmailQuotaSummary } from '#shared/types/communications'
import { EMAIL_ACCESS_RESERVE, EMAIL_DAILY_LIMIT } from '#shared/utils/constants'
import { plural } from '#shared/utils/format'

// Today's emails against the daily limit: one bar, always in view on the Comunicazioni page.
const props = defineProps<{ quota: EmailQuotaSummary }>()

const reserveLeft = computed(() => Math.max(0, Math.min(EMAIL_ACCESS_RESERVE, EMAIL_DAILY_LIMIT - props.quota.used)))
const share = (value: number) => `${(Math.min(value, EMAIL_DAILY_LIMIT) / EMAIL_DAILY_LIMIT) * 100}%`

const summary = computed(() => {
  const { queued, ordinaryLeft, departures, used } = props.quota
  if (queued) {
    const next = departures[0]
    return `${plural(queued, 'email', 'email')} in coda.${next ? ` Prossima partenza: ${departureLabel(next).toLowerCase()}.` : ''}`
  }
  if (ordinaryLeft) {
    return `Puoi inviarne ancora ${ordinaryLeft}. Le ultime ${reserveLeft.value} restano per password e codici.`
  }
  if (used < EMAIL_DAILY_LIMIT)
    return `I prossimi invii vanno in coda. Le ultime ${reserveLeft.value} restano per password e codici.`
  return 'Limite di oggi raggiunto. I prossimi invii vanno in coda e partono da soli.'
})
</script>

<template>
  <section class="rounded-lg border border-default bg-elevated p-5" aria-labelledby="email-quota-title">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div>
        <h2 id="email-quota-title" class="text-sm font-medium text-muted">Email di oggi</h2>
        <p class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">
          {{ quota.used }} <span class="text-base font-normal text-muted">su {{ EMAIL_DAILY_LIMIT }}</span>
        </p>
      </div>
      <UButton
        v-if="quota.queued"
        to="/admin/comunicazioni?tab=coda"
        color="neutral"
        variant="outline"
        icon="i-lucide-clock"
        :label="`Vedi la coda (${quota.queued})`"
      />
    </div>
    <div
      role="img"
      :aria-label="`${quota.used} email inviate oggi su ${EMAIL_DAILY_LIMIT}`"
      class="relative mt-3 h-2.5 overflow-hidden rounded-full bg-accented"
    >
      <div class="absolute inset-y-0 right-0 bg-warning/40" :style="{ width: share(reserveLeft) }" />
      <div class="absolute inset-y-0 left-0 rounded-full bg-primary" :style="{ width: share(quota.used) }" />
    </div>
    <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <li class="flex items-center gap-1.5">
        <span class="size-2 rounded-full bg-primary" aria-hidden="true" />
        Partite
      </li>
      <li v-if="reserveLeft" class="flex items-center gap-1.5">
        <span class="size-2 rounded-full bg-warning/40" aria-hidden="true" />
        Riserva per password e codici ({{ reserveLeft }}), usata per la coda alle 23:59
      </li>
    </ul>
    <p class="mt-2 text-sm text-muted">{{ summary }}</p>
  </section>
</template>
