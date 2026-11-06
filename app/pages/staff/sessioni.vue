<script setup lang="ts">
import type { CalendarEvent } from '~/components/ic/CalendarMonth.vue'
import type { MyConvocation, MyConvocations } from '#shared/types/staff'
import { todayIso } from '#shared/utils/dates'
import { formatDayRange } from '#shared/utils/format'

// The sessions the person accepted: a month calendar (an agenda on phones) and the list, upcoming first.
const { label } = useEnums()
const { data } = await useApiFetch<MyConvocations>('/api/staff/convocations')

const today = todayIso()
const sessions = computed(() => (data.value?.items ?? []).filter(c => c.status === 'accepted'))
const upcoming = computed(() =>
  sessions.value.filter(c => c.session.endDate >= today && c.session.status !== 'cancelled'),
)
const past = computed(() => sessions.value.filter(c => !upcoming.value.includes(c)).reverse())

function caption(c: MyConvocation): string {
  if (c.session.status === 'cancelled') return 'Sessione annullata'
  if (c.confirmed) return 'Confermata'
  return c.contract === 'pending' ? 'Contratto da firmare' : 'Accettata'
}

const events = computed<CalendarEvent[]>(() =>
  sessions.value.map(c => ({
    id: c.id,
    title: c.session.title,
    startDate: c.session.startDate,
    endDate: c.session.endDate,
    tone: c.session.status === 'cancelled' ? 'neutral' : c.confirmed ? 'success' : 'warning',
    caption: caption(c),
  })),
)
</script>

<template>
  <IcPage title="Sessioni">
    <template v-if="data">
      <UEmpty
        v-if="!sessions.length"
        icon="i-lucide-calendar-days"
        title="Nessuna sessione in programma"
        description="Le sessioni compaiono qui quando accetti una convocazione. Le convocazioni da rispondere le trovi nella loro pagina."
        :actions="[
          {
            label: 'Vai alle convocazioni',
            icon: 'i-lucide-bell-ring',
            to: '/staff/convocazioni',
            color: 'neutral',
            variant: 'outline',
            class: 'pointer-coarse:min-h-11',
          },
        ]"
      />

      <template v-else>
        <IcSection title="Calendario">
          <IcCalendarMonth
            :events="events"
            :initial-day="upcoming[0]?.session.startDate ?? past[0]?.session.startDate"
          />
        </IcSection>

        <IcSection title="Prossime sessioni">
          <p v-if="!upcoming.length" class="text-muted">Nessuna sessione in programma.</p>
          <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li
              v-for="c in upcoming"
              :key="c.id"
              class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-4"
            >
              <div class="min-w-0">
                <p class="font-semibold text-highlighted">{{ c.session.title }}</p>
                <p class="text-sm text-muted">
                  {{ formatDayRange(c.session.startDate, c.session.endDate, 'long') }} · {{ c.session.location }}
                </p>
                <p v-if="c.role" class="text-sm">Ruolo: {{ label('staffRole', c.role) }}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <StaffConvocationBadge :status="c.status" :confirmed="c.confirmed" />
                <UButton
                  class="pointer-coarse:min-h-11"
                  v-if="c.contract === 'pending' && c.contractRequestId"
                  :to="`/firma/${c.contractRequestId}`"
                  icon="i-lucide-signature"
                  label="Firma il contratto"
                />
              </div>
            </li>
          </ul>
        </IcSection>

        <IcSection v-if="past.length" title="Sessioni passate">
          <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li v-for="c in past" :key="c.id" class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 p-4">
              <div class="min-w-0">
                <p class="font-semibold">{{ c.session.title }}</p>
                <p class="text-sm text-muted">
                  {{ formatDayRange(c.session.startDate, c.session.endDate, 'long')
                  }}<template v-if="c.role"> · {{ label('staffRole', c.role) }}</template>
                </p>
              </div>
              <IcStatusBadge kind="sessionStatus" :value="c.session.status" />
            </li>
          </ul>
        </IcSection>
      </template>
    </template>
  </IcPage>
</template>
