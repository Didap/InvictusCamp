<script setup lang="ts">
import type { DashboardSession } from '#shared/types/dashboard'
import { todayIso } from '#shared/utils/dates'
import { formatDay, formatDayRange, plural, relativeDay } from '#shared/utils/format'

// A session that has not ended yet: dates, countdown, status and how its places and staff are going.
const props = withDefaults(defineProps<{ session: DashboardSession; level?: 2 | 3; today?: string }>(), {
  level: 3,
  today: () => todayIso(),
})

const when = computed(() => {
  const { startDate, endDate } = props.session
  if (startDate > props.today) return `Inizia ${relativeDay(startDate, props.today)}`
  return `In corso, fino al ${formatDay(endDate)}`
})

const places = computed(() => {
  const p = props.session.places
  const waiting = p.held - p.confirmed
  return {
    summary: p.total ? `${p.confirmed}/${p.total} ${p.confirmed === 1 ? 'confermata' : 'confermate'}` : 'Nessun posto',
    confirmed: { value: p.confirmed, label: plural(p.confirmed, 'confermata', 'confermate') },
    pending: {
      value: waiting,
      label:
        props.session.status === 'draft'
          ? plural(waiting, 'scelta, da invitare', 'scelte, da invitare')
          : `${waiting} in attesa di risposta`,
    },
    rest: p.free ? plural(p.free, 'posto libero', 'posti liberi') : undefined,
    reserves: p.reserves ? plural(p.reserves, 'riserva in lista', 'riserve in lista') : null,
  }
})

// The same words as the sessions list and the session page: "da inviare" for convocations not sent yet,
// "da trovare" for the people nobody has been convoked for yet.
const staff = computed(() => {
  const s = props.session.staff
  const waiting = s.accepted - s.confirmed + s.waiting
  const missing = Math.max(0, s.needed - s.confirmed - waiting - s.toSend)
  return {
    summary: s.needed
      ? `${s.confirmed}/${s.needed} ${s.confirmed === 1 ? 'confermato' : 'confermati'}`
      : 'Nessuna persona richiesta',
    confirmed: { value: s.confirmed, label: plural(s.confirmed, 'confermato', 'confermati') },
    pending: { value: waiting, label: `${waiting} in attesa di risposta o firma` },
    rest: missing ? `${missing} da trovare` : undefined,
    toSend: s.drafts ? plural(s.drafts, 'convocazione da inviare', 'convocazioni da inviare') : null,
  }
})
</script>

<template>
  <article class="min-w-0">
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div class="min-w-0">
        <component :is="`h${level}`" :class="level === 2 ? 'text-xl font-bold' : 'text-base font-bold'">
          <ULink :to="`/admin/sessioni/${session.id}`" class="text-highlighted hover:underline">
            {{ session.title }}
          </ULink>
        </component>
        <p class="mt-0.5 text-sm text-muted">
          {{ formatDayRange(session.startDate, session.endDate, 'long') }} · {{ when }}
          <template v-if="session.responseDeadline && session.status === 'inviting'">
            · Risposte entro il {{ formatDay(session.responseDeadline) }}
          </template>
        </p>
      </div>
      <IcStatusBadge kind="sessionStatus" :value="session.status" />
    </div>
    <div class="mt-4 grid gap-x-10 gap-y-5 md:grid-cols-2">
      <DashboardMeter
        label="Famiglie"
        :to="`/admin/sessioni/${session.id}?tab=famiglie`"
        :summary="places.summary"
        :max="session.places.total"
        :confirmed="places.confirmed"
        :pending="places.pending"
        :rest="places.rest"
      >
        <li v-if="places.reserves">{{ places.reserves }}</li>
      </DashboardMeter>
      <DashboardMeter
        label="Staff"
        :to="`/admin/sessioni/${session.id}?tab=staff`"
        :summary="staff.summary"
        :max="session.staff.needed"
        :confirmed="staff.confirmed"
        :pending="staff.pending"
        :rest="staff.rest"
      >
        <li v-if="staff.toSend">{{ staff.toSend }}</li>
      </DashboardMeter>
    </div>
  </article>
</template>
