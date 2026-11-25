<script setup lang="ts">
import type { MyConvocation, MyConvocations } from '#shared/types/staff'
import { todayIso } from '#shared/utils/dates'
import { formatDayRange } from '#shared/utils/format'
import { isSessionAhead, isSessionOver } from '#shared/utils/session-status'

// The sessions of the person (spec 3.5): the contracts still to sign, the next sessions confirmed, the sessions
// done, and those cancelled that were still ahead. No calendar: a list is what the staff asked for.
const { data } = await useApiFetch<MyConvocations>('/api/staff/convocations')

const today = todayIso()
const items = computed(() => data.value?.items ?? [])
const accepted = computed(() => items.value.filter(c => c.status === 'accepted'))
const ahead = computed(() => accepted.value.filter(c => isSessionAhead(c.session, today)))
const toSign = computed(() => ahead.value.filter(c => !c.confirmed))
const upcoming = computed(() => ahead.value.filter(c => c.confirmed))
const done = computed(() => accepted.value.filter(c => isSessionOver(c.session, today)).reverse())
/** Cancelled while still ahead: the convocation withdrawn, or the session cancelled after the person accepted. */
const cancelled = computed(() =>
  items.value.filter(
    c =>
      c.session.endDate >= today &&
      (c.status === 'cancelled' || (c.status === 'accepted' && c.session.status === 'cancelled')),
  ),
)

const where = (c: MyConvocation) =>
  `${formatDayRange(c.session.startDate, c.session.endDate, 'long')} · ${c.session.location}`
</script>

<template>
  <IcPage title="Sessioni" width="narrow">
    <template v-if="data">
      <UEmpty
        v-if="!ahead.length && !done.length && !cancelled.length"
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
        <template v-for="c in toSign" :key="c.id">
          <UAlert
            v-if="c.contractRequestId"
            class="mb-4"
            color="warning"
            variant="subtle"
            icon="i-lucide-signature"
            :title="`Firma il contratto per confermare «${c.session.title}»`"
            :description="where(c)"
            :actions="[
              {
                label: 'Firma il contratto',
                to: `/firma/${c.contractRequestId}`,
                color: 'neutral',
                variant: 'outline',
                class: 'pointer-coarse:min-h-11',
              },
            ]"
          />
          <UAlert
            v-else
            class="mb-4"
            color="info"
            variant="subtle"
            icon="i-lucide-file-clock"
            :title="`Il contratto per «${c.session.title}» arriverà dall’amministrazione`"
            :description="`${where(c)}. Ti avvisiamo per email quando è pronto da firmare.`"
          />
        </template>

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
                <p class="text-sm text-muted">{{ where(c) }}</p>
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

        <IcSection v-if="cancelled.length" title="Annullate">
          <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li v-for="c in cancelled" :key="c.id" class="p-4">
              <p class="font-semibold">{{ c.session.title }}</p>
              <p class="text-sm text-muted">
                {{ formatDayRange(c.session.startDate, c.session.endDate, 'long') }} ·
                {{ c.session.status === 'cancelled' ? 'Sessione annullata' : 'Convocazione annullata' }}
              </p>
            </li>
          </ul>
        </IcSection>
      </template>
    </template>
  </IcPage>
</template>
