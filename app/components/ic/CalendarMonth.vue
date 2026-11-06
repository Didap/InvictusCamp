<script setup lang="ts">
import type { Tone } from '#shared/utils/constants'
import { addDays, monthBounds, rangesOverlap, todayIso, weekdayIndex, type IsoDay } from '#shared/utils/dates'
import { formatDayRange, formatMonth } from '#shared/utils/format'

// A month of sessions. Desktop: a grid of weeks; phones: an agenda of the month's events.
// Events are inclusive day ranges; `caption` (e.g. the status label) is read with the title.
export interface CalendarEvent {
  id: string
  title: string
  startDate: IsoDay
  endDate: IsoDay
  to?: string
  tone?: Tone
  caption?: string
}

const props = defineProps<{ events: CalendarEvent[]; initialDay?: IsoDay }>()

const today = todayIso()
const monthOf = (day: IsoDay) => `${day.slice(0, 7)}-01`

function firstUsefulDay(): IsoDay {
  const upcoming = [...props.events]
    .filter(e => e.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  return upcoming?.startDate ?? today
}

const cursor = ref(monthOf(props.initialDay ?? firstUsefulDay()))
const month = computed(() => monthBounds(cursor.value))

const weeks = computed(() => {
  const start = addDays(month.value.startDate, -weekdayIndex(month.value.startDate))
  const end = addDays(month.value.endDate, 6 - weekdayIndex(month.value.endDate))
  const days: IsoDay[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day)
  return Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7))
})

const monthEvents = computed(() =>
  props.events
    .filter(event => rangesOverlap(event, month.value))
    .sort((a, b) => a.startDate.localeCompare(b.startDate)),
)

function eventsOn(day: IsoDay) {
  return monthEvents.value.filter(event => event.startDate <= day && day <= event.endDate)
}

function shift(months: number) {
  const date = new Date(Date.UTC(Number(cursor.value.slice(0, 4)), Number(cursor.value.slice(5, 7)) - 1 + months, 1))
  cursor.value = date.toISOString().slice(0, 10)
}

const TONES: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary ring-primary/25',
  secondary: 'bg-secondary/10 text-secondary ring-secondary/25',
  success: 'bg-success/10 text-success ring-success/25',
  info: 'bg-info/10 text-info ring-info/25',
  warning: 'bg-warning/10 text-warning ring-warning/25',
  error: 'bg-error/10 text-error ring-error/25',
  neutral: 'bg-elevated text-default ring-accented',
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-bold text-highlighted first-letter:uppercase" aria-live="polite">
        {{ formatMonth(cursor) }}
      </h2>
      <div class="flex gap-1">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="outline"
          aria-label="Mese precedente"
          @click="shift(-1)"
        />
        <UButton label="Oggi" color="neutral" variant="outline" @click="cursor = monthOf(today)" />
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="outline"
          aria-label="Mese successivo"
          @click="shift(1)"
        />
      </div>
    </div>

    <table class="hidden w-full table-fixed border-collapse sm:table">
      <thead>
        <tr>
          <th
            v-for="day in WEEKDAYS"
            :key="day"
            scope="col"
            class="pb-2 text-left text-xs font-semibold text-muted uppercase"
          >
            {{ day }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(week, index) in weeks" :key="index">
          <td
            v-for="day in week"
            :key="day"
            class="h-24 border border-default p-1.5 align-top"
            :class="day.slice(0, 7) === cursor.slice(0, 7) ? 'bg-elevated' : 'bg-muted text-dimmed'"
          >
            <span
              class="inline-flex size-6 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
              :class="day === today ? 'bg-primary text-inverted' : ''"
            >
              {{ Number(day.slice(8)) }}
            </span>
            <ul class="mt-1 space-y-1">
              <li v-for="event in eventsOn(day)" :key="event.id">
                <component
                  :is="event.to ? resolveComponent('NuxtLink') : 'span'"
                  :to="event.to"
                  class="block truncate rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset"
                  :class="TONES[event.tone ?? 'primary']"
                  :title="`${event.title}, ${formatDayRange(event.startDate, event.endDate)}`"
                >
                  {{ event.title }}
                </component>
              </li>
            </ul>
          </td>
        </tr>
      </tbody>
    </table>

    <ul class="space-y-2 sm:hidden">
      <li v-for="event in monthEvents" :key="event.id">
        <component
          :is="event.to ? resolveComponent('NuxtLink') : 'div'"
          :to="event.to"
          class="block rounded-lg border border-default bg-elevated p-3"
        >
          <p class="font-semibold text-highlighted">{{ event.title }}</p>
          <p class="text-sm text-muted">
            {{ formatDayRange(event.startDate, event.endDate, 'long')
            }}<span v-if="event.caption">, {{ event.caption }}</span>
          </p>
        </component>
      </li>
    </ul>
    <p v-if="!monthEvents.length" class="mt-3 text-sm text-muted">Nessuna sessione in questo mese.</p>
  </div>
</template>
