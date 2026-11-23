<script setup lang="ts">
import { emailTemplateLabel } from '#shared/schemas/communications'
import type { EmailQueueOverview } from '#shared/types/communications'
import { formatDateTime, plural } from '#shared/utils/format'

// The queue at a glance: when the waiting emails leave and who receives them, in order.
const DEPARTURES_SHOWN = 6

const props = defineProps<{ queue: EmailQueueOverview }>()

const ordinary = computed(() => props.queue.limit - props.queue.reserve)
const shownDepartures = computed(() => props.queue.departures.slice(0, DEPARTURES_SHOWN))
const laterCount = computed(() =>
  props.queue.departures.slice(DEPARTURES_SHOWN).reduce((total, departure) => total + departure.count, 0),
)
</script>

<template>
  <div v-if="!queue.queued" class="rounded-lg border border-default bg-elevated p-8 text-center">
    <UIcon name="i-lucide-circle-check" class="size-6 text-success" />
    <p class="mt-2 font-medium text-highlighted">Nessuna email in coda</p>
    <p class="mx-auto mt-1 max-w-prose text-sm text-muted">
      Quando un invio supera il limite di {{ queue.limit }} email al giorno, quelle in più compaiono qui e partono da
      sole.
    </p>
  </div>

  <div v-else class="space-y-6">
    <section aria-labelledby="queue-plan-title">
      <h2 id="queue-plan-title" class="font-medium text-highlighted">Quando partono</h2>
      <p class="mt-1 text-sm text-muted">
        Ogni giorno partono fino a {{ ordinary }} email dalle 8 alle 20. Alle 23:59 parte anche quello che resta, fino a
        {{ queue.limit }}.
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
        <li v-for="item in queue.items" :key="item.id" class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <span class="w-8 shrink-0 text-sm text-muted tabular-nums">{{ item.position }}</span>
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
