<script setup lang="ts">
import { APPLICATION_CHECKLIST } from '#shared/schemas/staff'
import type { StaffHome } from '#shared/types/staff'
import { todayIso } from '#shared/utils/dates'
import { formatDay, formatDayRange } from '#shared/utils/format'

// The staff home: it follows the application (spec 3.4). Registered: complete the application. Applied:
// wait for the review. Approved: convocations to answer, next sessions, documents to sign, availability.
// Not selected: a kind message. Inactive: no convocations for now.
const { user } = useUserSession()
const { label } = useEnums()
const { data: home, refresh } = await useApiFetch<StaffHome>('/api/staff/home')

const dayOf = (instant: string | null) => (instant ? formatDay(todayIso(new Date(instant)), 'long') : '')
const checklist = computed(() =>
  APPLICATION_CHECKLIST.map(part => ({ part, done: !home.value?.missing.includes(part) })),
)
const started = computed(() => checklist.value.some(item => item.done))
</script>

<template>
  <IcPage :title="user?.firstName ? `Ciao ${user.firstName}` : 'Home'" width="narrow">
    <template v-if="home">
      <!-- Registered: the application is still to complete and send. -->
      <IcSection
        v-if="home.status === 'registered'"
        title="Completa la candidatura"
        description="Per entrare nello staff di Invictus Camp ti chiediamo qualche informazione su di te e il tuo CV in PDF. Puoi salvare e riprendere quando vuoi."
      >
        <ul class="space-y-2" aria-label="Cosa serve per la candidatura">
          <li v-for="item in checklist" :key="item.part" class="flex items-center gap-3">
            <UIcon
              :name="item.done ? 'i-lucide-circle-check' : 'i-lucide-circle'"
              class="size-5 shrink-0"
              :class="item.done ? 'text-success' : 'text-dimmed'"
              aria-hidden="true"
            />
            <span :class="item.done ? 'text-muted' : 'text-highlighted'">{{ item.part }}</span>
            <span class="sr-only">{{ item.done ? ': fatto' : ': da completare' }}</span>
          </li>
        </ul>
        <UButton
          to="/staff/candidatura"
          size="lg"
          icon="i-lucide-file-user"
          :label="started ? 'Riprendi la candidatura' : 'Completa la candidatura'"
          class="pointer-coarse:min-h-11 mt-6"
        />
      </IcSection>

      <!-- Applied: waiting for the review. -->
      <IcSection v-else-if="home.status === 'applied'" title="La tua candidatura">
        <div class="flex items-start gap-4">
          <UIcon name="i-lucide-hourglass" class="mt-1 size-6 shrink-0 text-info" aria-hidden="true" />
          <div class="max-w-prose space-y-2">
            <p class="font-semibold text-highlighted">Candidatura inviata il {{ dayOf(home.appliedAt) }}.</p>
            <p class="text-muted">
              L’amministrazione la sta valutando. Ti scriveremo per email quando c’è un esito: intanto non devi fare
              nulla.
            </p>
            <UButton
              to="/staff/candidatura"
              label="Rivedi la candidatura"
              icon="i-lucide-file-user"
              color="neutral"
              variant="outline"
              class="pointer-coarse:min-h-11 mt-2"
            />
          </div>
        </div>
      </IcSection>

      <!-- Not selected: a kind message. -->
      <IcSection v-else-if="home.status === 'rejected'" title="Grazie per la tua candidatura">
        <div class="max-w-prose space-y-3">
          <p>Abbiamo letto con attenzione quello che ci hai scritto.</p>
          <p>
            Per questa stagione non possiamo inserirti nello staff di Invictus Camp. Ti ringraziamo per il tempo che ci
            hai dedicato e per l’interesse verso il camp.
          </p>
          <IcContactLine lead="Se hai domande" class="text-muted" />
        </div>
      </IcSection>

      <!-- Approved (and inactive): convocations, sessions, documents, availability. -->
      <template v-else>
        <IcSection v-if="home.status === 'inactive'" title="Il tuo profilo non è attivo">
          <p class="max-w-prose text-muted">
            Al momento non ricevi convocazioni e non puoi indicare la disponibilità.
            <IcContactLine as="span" lead="Se vuoi tornare disponibile" />
          </p>
        </IcSection>

        <IcSection
          v-if="home.toAnswer.length"
          title="Convocazioni da rispondere"
          description="L’amministrazione ti ha convocato: accetta o rifiuta."
        >
          <div class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <StaffMyConvocation v-for="c in home.toAnswer" :key="c.id" :convocation="c" @changed="refresh" />
          </div>
        </IcSection>

        <IcSection title="Le tue prossime sessioni">
          <template v-if="home.upcoming.length" #actions>
            <UButton
              class="pointer-coarse:min-h-11"
              to="/staff/sessioni"
              label="Calendario"
              icon="i-lucide-calendar-days"
              color="neutral"
              variant="ghost"
            />
          </template>
          <ul v-if="home.upcoming.length" class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li
              v-for="c in home.upcoming"
              :key="c.id"
              class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-4"
            >
              <div class="min-w-0">
                <p class="font-semibold text-highlighted">{{ c.session.title }}</p>
                <p class="text-sm text-muted">
                  {{ formatDayRange(c.session.startDate, c.session.endDate, 'long')
                  }}<template v-if="c.role"> · {{ label('staffRole', c.role) }}</template>
                </p>
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
          <p v-else class="text-muted">Nessuna sessione in programma. Quando accetti una convocazione, la trovi qui.</p>
        </IcSection>

        <IcSection title="Documenti da firmare">
          <DocumentsPendingSignatures />
        </IcSection>

        <IcSection v-if="home.status === 'approved'" title="La tua disponibilità">
          <div v-if="home.availability.next" class="flex flex-wrap items-center justify-between gap-3">
            <p class="max-w-prose">
              {{
                home.availability.upcoming === 1
                  ? 'Hai indicato un periodo:'
                  : `Hai indicato ${home.availability.upcoming} periodi. Il prossimo:`
              }}
              <span class="font-semibold text-highlighted">
                {{ formatDayRange(home.availability.next.startDate, home.availability.next.endDate, 'long') }}
              </span>
            </p>
            <UButton
              class="pointer-coarse:min-h-11"
              to="/staff/disponibilita"
              label="Aggiorna la disponibilità"
              icon="i-lucide-calendar-check"
              color="neutral"
              variant="outline"
            />
          </div>
          <UAlert
            v-else
            color="warning"
            variant="subtle"
            icon="i-lucide-calendar-plus"
            title="Indica quando sei disponibile"
            description="Ti convochiamo per le sessioni che cadono nei periodi che ci indichi."
            :actions="[
              {
                label: 'Indica la disponibilità',
                to: '/staff/disponibilita',
                class: 'pointer-coarse:min-h-11',
                color: home.toAnswer.length ? 'neutral' : 'primary',
                variant: home.toAnswer.length ? 'outline' : 'solid',
              },
            ]"
          />
        </IcSection>
      </template>
    </template>
  </IcPage>
</template>
