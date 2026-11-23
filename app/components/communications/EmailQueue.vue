<script setup lang="ts">
import { emailTemplateLabel } from '#shared/schemas/communications'
import type { EmailQueueOverview } from '#shared/types/communications'
import {
  EMAIL_DAILY_LIMIT,
  EMAIL_ORDINARY_LIMIT,
  EMAIL_QUEUE_END_HOUR,
  EMAIL_QUEUE_START_HOUR,
} from '#shared/utils/constants'
import { formatDateTime, plural } from '#shared/utils/format'

// The queue at a glance: when the waiting emails leave and who receives them, in order. It loads only
// while its tab is open.
const DEPARTURES_SHOWN = 6

const queue = useLiveEmailData<EmailQueueOverview>('/api/admin/email-log/queue')

const departures = computed(() => queue.value?.departures ?? [])
const shownDepartures = computed(() => departures.value.slice(0, DEPARTURES_SHOWN))
const laterCount = computed(() =>
  departures.value.slice(DEPARTURES_SHOWN).reduce((total, departure) => total + departure.count, 0),
)
</script>

<template>
  <div v-if="queue && !queue.queued" class="rounded-lg border border-default bg-elevated p-8 text-center">
    <UIcon name="i-lucide-circle-check" class="size-6 text-success" />
    <p class="mt-2 font-medium text-highlighted">Nessuna email in coda</p>
    <p class="mx-auto mt-1 max-w-prose text-sm text-muted">
      Quando un invio supera il limite di {{ EMAIL_DAILY_LIMIT }} email al giorno, quelle in più compaiono qui e partono
      da sole.
    </p>
  </div>

  <div v-else-if="queue" class="space-y-6">
    <section aria-labelledby="queue-plan-title">
      <h2 id="queue-plan-title" class="font-medium text-highlighted">Quando partono</h2>
      <p class="mt-1 text-sm text-muted">
        Ogni giorno partono fino a {{ EMAIL_ORDINARY_LIMIT }} email dalle {{ EMAIL_QUEUE_START_HOUR }} alle
        {{ EMAIL_QUEUE_END_HOUR }}. Alle 23:59 parte anche quello che resta, fino a {{ EMAIL_DAILY_LIMIT }}.
      </p>
      <ol class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li
          v-for="departure in shownDepartures"
          :key="`${departure.day}-${departure.time}`"
          class="rounded-lg border border-default bg-elevated p-4"
        >
          <p class="text-sm text-muted">{{ departureLabel(departure) }}</p>
          <p class="mt-1 text-xl font-semibold text-highlighted tabular-nums">
            {{ plural(departure.count, 'email', 'email') }}
          </p>
        </li>
      </ol>
      <p v-if="laterCount" class="mt-2 text-sm text-muted">E poi altre {{ laterCount }} nei giorni seguenti.</p>
    </section>

    <section aria-labelledby="queue-list-title">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 id="queue-list-title" class="font-medium text-highlighted">In attesa, in ordine di partenza</h2>
        <UButton
          to="/admin/comunicazioni?tab=registro&status=queued"
          color="neutral"
          variant="ghost"
          trailing-icon="i-lucide-arrow-right"
          label="Apri nel registro"
        />
      </div>
      <ol class="mt-2 divide-y divide-default rounded-lg border border-default bg-elevated">
        <li
          v-for="(item, index) in queue.items"
          :key="item.id"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
        >
          <span class="w-8 shrink-0 text-sm text-muted tabular-nums">{{ index + 1 }}</span>
          <div class="min-w-0 flex-1 basis-48">
            <p class="truncate font-medium text-highlighted">{{ item.toName ?? item.toEmail }}</p>
            <p class="truncate text-sm text-muted">{{ item.subject }}</p>
            <p class="text-xs text-muted">
              {{ emailTemplateLabel(item.template) }} · in coda dal {{ formatDateTime(item.createdAt) }}
            </p>
          </div>
          <UBadge color="warning" variant="subtle" icon="i-lucide-clock" :label="departureLabel(item.departure)" />
        </li>
      </ol>
      <p v-if="queue.queued > queue.items.length" class="mt-2 text-sm text-muted">
        Qui vedi le prime {{ queue.items.length }} di {{ queue.queued }}. Le altre sono nel registro.
      </p>
    </section>
  </div>
</template>
