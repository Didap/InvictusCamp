<script setup lang="ts">
import type { MyConvocations } from '#shared/types/staff'
import { todayIso } from '#shared/utils/dates'
import { formatDayRange } from '#shared/utils/format'
import { canStaffReadProgramme } from '#shared/utils/programme'

// The sessions the person accepted (spec 3.5): the contracts still to sign, the next sessions confirmed, the
// sessions done. No calendar: a list is what the staff asked for.
const { data } = await useApiFetch<MyConvocations>('/api/staff/convocations')

const today = todayIso()
const accepted = computed(() => (data.value?.items ?? []).filter(c => c.status === 'accepted'))
const ahead = computed(() => accepted.value.filter(c => c.session.endDate >= today && c.session.status !== 'cancelled'))
const toSign = computed(() => ahead.value.filter(c => !c.confirmed))
const upcoming = computed(() => ahead.value.filter(c => c.confirmed))
const done = computed(() =>
  accepted.value.filter(c => c.session.endDate < today && c.session.status !== 'cancelled').reverse(),
)
</script>

<template>
  <IcPage title="Sessioni" width="narrow">
    <template v-if="data">
      <UEmpty
        v-if="!ahead.length && !done.length"
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
        <UAlert
          v-for="c in toSign"
          :key="c.id"
          class="mb-4"
          color="warning"
          variant="subtle"
          icon="i-lucide-signature"
          :title="`Firma il contratto per confermare «${c.session.title}»`"
          :description="`${formatDayRange(c.session.startDate, c.session.endDate, 'long')} · ${c.session.location}`"
          :actions="
            c.contractRequestId
              ? [
                  {
                    label: 'Firma il contratto',
                    to: `/firma/${c.contractRequestId}`,
                    color: 'neutral',
                    variant: 'outline',
                    class: 'pointer-coarse:min-h-11',
                  },
                ]
              : []
          "
        />

        <IcSection title="Le tue prossime sessioni confermate">
          <p v-if="!upcoming.length" class="text-muted">Nessuna sessione confermata in programma.</p>
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
                <p v-if="c.roleName" class="text-sm">Ruolo: {{ c.roleName }}</p>
              </div>
              <UButton
                v-if="canStaffReadProgramme(c.status, c.session.status)"
                :to="`/staff/programma/${c.session.id}`"
                icon="i-lucide-calendar-clock"
                label="Programma"
                color="neutral"
                variant="outline"
                class="pointer-coarse:min-h-11"
              />
            </li>
          </ul>
        </IcSection>

        <IcSection v-if="done.length" title="Sessioni fatte">
          <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li v-for="c in done" :key="c.id" class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 p-4">
              <div class="min-w-0">
                <p class="font-semibold">{{ c.session.title }}</p>
                <p class="text-sm text-muted">
                  {{ formatDayRange(c.session.startDate, c.session.endDate, 'long')
                  }}<template v-if="c.roleName"> · {{ c.roleName }}</template>
                </p>
              </div>
              <UButton
                v-if="canStaffReadProgramme(c.status, c.session.status)"
                :to="`/staff/programma/${c.session.id}`"
                icon="i-lucide-calendar-clock"
                label="Programma"
                color="neutral"
                variant="outline"
                class="pointer-coarse:min-h-11"
              />
            </li>
          </ul>
        </IcSection>
      </template>
    </template>
  </IcPage>
</template>
