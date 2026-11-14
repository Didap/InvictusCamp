<script setup lang="ts">
import type { CalendarEvent } from '~/components/ic/CalendarMonth.vue'
import type { FamilySessionItem } from '#shared/types/sessions'
import { PROGRAMME_GROUP_LABELS, enumLabel } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDayRange } from '#shared/utils/format'

// The family's sessions (docs/spec.md 3.3): the invitations to answer, the calendar, the next sessions
// and the history. A session appears only once the family has been invited. Calendar events carry no
// link: everything the family can do with a session is on this page.
const { data, error, refresh } = await useApiFetch<FamilySessionItem[]>('/api/family/sessions', {
  key: 'family-sessions',
})

const today = todayIso()
const items = computed(() => data.value ?? [])
const isUpcoming = (item: FamilySessionItem) =>
  !item.canConfirm &&
  item.endDate >= today &&
  (item.status === 'confirmed' || item.status === 'invited') &&
  item.sessionStatus !== 'cancelled' &&
  item.sessionStatus !== 'completed'
const upcoming = computed(() => items.value.filter(isUpcoming))
const history = computed(() =>
  items.value
    .filter(item => !item.canConfirm && !isUpcoming(item))
    .sort((a, b) => b.startDate.localeCompare(a.startDate)),
)

const events = computed<CalendarEvent[]>(() =>
  items.value
    .filter(item => item.status === 'invited' || item.status === 'confirmed')
    .map(item => ({
      id: item.id,
      title: item.title,
      startDate: item.startDate,
      endDate: item.endDate,
      tone: item.status === 'confirmed' ? 'success' : item.kind === 'reserve' ? 'neutral' : 'info',
      caption:
        item.kind === 'reserve' && item.status === 'invited'
          ? 'In lista di riserva'
          : enumLabel('participationStatus', item.status),
    })),
)
// The month grid helps only with more than one session ahead: with one, or none ahead, the cards below
// already say when it is (and an empty month would greet the family).
const showCalendar = computed(() => events.value.filter(event => event.endDate >= today).length > 1)
</script>

<template>
  <IcPage title="Sessioni">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare le tue sessioni"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <UEmpty
      v-else-if="!items.length"
      icon="i-lucide-calendar-heart"
      title="Nessuna sessione, per ora"
      description="Quando la tua famiglia sarà invitata a una sessione del camp la troverai qui, e ti arriverà anche un’email."
    />

    <template v-else>
      <SessionsFamilyInvitations />

      <IcSection v-if="showCalendar" title="Calendario">
        <IcCalendarMonth :events="events" />
      </IcSection>

      <IcSection v-if="upcoming.length" title="Le prossime sessioni">
        <div class="grid gap-4">
          <SessionsInvitationCard v-for="item in upcoming" :key="item.id" :item="item" />
        </div>
      </IcSection>

      <IcSection
        v-if="history.length"
        title="Storico"
        description="Le sessioni passate, con il tuo gruppo, l’alloggio e il programma, quelle a cui hai rinunciato e quelle annullate."
      >
        <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-elevated">
          <li
            v-for="item in history"
            :id="`sessione-${item.sessionId}`"
            :key="item.id"
            class="flex scroll-mt-6 flex-col items-start gap-2 p-4 sm:flex-row sm:justify-between"
          >
            <div class="min-w-0">
              <p class="font-semibold text-highlighted">{{ item.title }}</p>
              <p class="text-sm text-muted">{{ formatDayRange(item.startDate, item.endDate, 'long') }}</p>
              <p v-if="item.status === 'declined' && item.declineReason" class="mt-1 text-sm text-muted">
                Motivo: {{ item.declineReason }}
              </p>
              <div v-if="item.lived" class="mt-2 space-y-1 text-sm">
                <p v-if="item.lived.group" class="flex items-center gap-2">
                  <ProgrammeGroupDot :group="item.lived.group" />
                  {{
                    `Gruppo ${PROGRAMME_GROUP_LABELS[item.lived.group]}${item.lived.groupLead ? `, con ${item.lived.groupLead}` : ''}`
                  }}
                </p>
                <p v-if="item.lived.lodging" class="flex items-center gap-2">
                  <UIcon name="i-lucide-bed-double" class="size-4 shrink-0 text-muted" aria-hidden="true" />
                  {{ item.lived.lodging }}
                </p>
                <UButton
                  v-if="item.lived.hasProgramme"
                  class="mt-2 pointer-coarse:min-h-11"
                  :to="`/famiglia/programma/${item.sessionId}`"
                  icon="i-lucide-calendar-clock"
                  label="Il programma della settimana"
                  color="neutral"
                  variant="outline"
                />
              </div>
              <p v-if="item.feedback === 'sent'" class="mt-1 text-sm text-muted">Questionario inviato, grazie.</p>
              <UButton
                v-else-if="item.feedback === 'open'"
                class="mt-3"
                variant="soft"
                icon="i-lucide-message-square-heart"
                label="Rispondi al questionario"
                :to="`/famiglia/questionario/${item.sessionId}`"
              />
            </div>
            <IcStatusBadge
              v-if="item.status === 'confirmed' && item.sessionStatus === 'completed'"
              kind="sessionStatus"
              value="completed"
            />
            <IcStatusBadge v-else kind="participationStatus" :value="item.status" />
          </li>
        </ul>
      </IcSection>
    </template>
  </IcPage>
</template>
