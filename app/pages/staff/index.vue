<script setup lang="ts">
import { requiredDocumentsText } from '#shared/schemas/staff'
import type { StaffHome } from '#shared/types/staff'
import { formatDayRange, plural } from '#shared/utils/format'

// The staff home: it follows the application (spec 3.4). Until the approval it is the whole area:
// registered, the CV to upload (an account made before it was asked at registration); applied, the
// notice that we are reviewing it; not selected, a kind message. Approved: the personal sheet while it is
// incomplete, convocations to answer, next sessions, documents to sign, availability. Inactive: no
// convocations for now.
const { user, session, fetch: fetchSession } = useUserSession()
const { data: home, refresh } = await useApiFetch<StaffHome>('/api/staff/home')
const documentsAlert = computed(() => {
  const missing = home.value?.documentsMissing ?? []
  return `${missing.length === 1 ? 'Ci serve' : 'Ci servono'} ${requiredDocumentsText(missing)}, in PDF.`
})

// The approval may come while the tab is open: the session, and with it the menu, catches up.
watch(
  () => home.value?.status,
  status => {
    if (status && status !== session.value?.staffStatus) fetchSession()
  },
)
</script>

<template>
  <IcPage :title="user?.firstName ? `Ciao ${user.firstName}` : 'Home'" width="narrow">
    <template v-if="home">
      <!-- Registered: the CV is missing, and with it the application. -->
      <IcSection
        v-if="home.status === 'registered'"
        title="Carica qui il tuo CV"
        description="Per completare la candidatura ci serve il tuo curriculum in PDF: con il CV la candidatura arriva a noi."
      >
        <IcFileUpload
          endpoint="/api/staff/application/cv"
          accept="application/pdf"
          description="PDF, fino a 15 MB"
          button-label="Invia il CV"
          @uploaded="refresh()"
        />
      </IcSection>

      <!-- Applied: waiting for the review, nothing else to see. -->
      <IcSection v-else-if="home.status === 'applied'" title="La tua candidatura">
        <div class="flex items-start gap-4">
          <UIcon name="i-lucide-hourglass" class="mt-1 size-6 shrink-0 text-info" aria-hidden="true" />
          <div class="max-w-prose space-y-2">
            <p class="font-semibold text-highlighted">Grazie per la tua richiesta.</p>
            <p>Stiamo valutando la candidatura e presto riceverai aggiornamenti.</p>
            <IcContactLine lead="Per dubbi o necessità" class="text-muted" />
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

      <!-- Approved (and inactive): the sheet to complete, convocations, sessions, documents, availability. -->
      <template v-else>
        <UAlert
          v-if="home.sheetMissing"
          class="mb-8"
          color="warning"
          variant="subtle"
          icon="i-lucide-id-card"
          title="Completa la tua scheda personale"
          :description="home.sheetMissing"
          :actions="[
            {
              label: 'Compila la scheda',
              to: '/staff/scheda',
              class: 'pointer-coarse:min-h-11',
              color: 'neutral',
              variant: 'outline',
            },
          ]"
        />

        <UAlert
          v-if="home.documentsMissing.length"
          class="mb-8"
          color="warning"
          variant="subtle"
          icon="i-lucide-file-up"
          title="Carica i documenti obbligatori"
          :description="documentsAlert"
          :actions="[
            {
              label: 'Vai ai documenti',
              to: '/staff/documenti',
              class: 'pointer-coarse:min-h-11',
              color: 'neutral',
              variant: 'outline',
            },
          ]"
        />

        <IcSection v-if="home.status === 'inactive'" title="Il tuo profilo non è attivo">
          <p class="max-w-prose text-muted">
            Al momento non ricevi convocazioni e non puoi indicare la disponibilità.
            <IcContactLine as="span" lead="Se vuoi tornare disponibile" />
          </p>
        </IcSection>

        <IcSection
          v-if="home.toAnswer.length"
          title="Convocazioni da rispondere"
          description="Accetta o rifiuta il prima possibile per organizzare al meglio la sessione."
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
              label="Tutte le sessioni"
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
                  }}<template v-if="c.roleName"> · {{ c.roleName }}</template>
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
          <p v-if="!home.availability.total" class="max-w-prose text-muted">
            Non ci sono sessioni in programma: quando le prepariamo, indichi qui a quali puoi venire.
          </p>
          <div
            v-else-if="home.availability.available || !home.availability.toConfirm"
            class="flex flex-wrap items-center justify-between gap-3"
          >
            <p class="max-w-prose">
              Hai indicato
              <span class="font-semibold text-highlighted">{{
                plural(home.availability.available, 'sessione', 'sessioni')
              }}</span>
              su {{ home.availability.total }} in programma.<template v-if="home.availability.toConfirm">
                Quando hai finito, conferma le tue preferenze.</template
              >
            </p>
            <UButton
              class="pointer-coarse:min-h-11"
              to="/staff/disponibilita"
              :label="home.availability.toConfirm ? 'Conferma la disponibilità' : 'Vedi la disponibilità'"
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
            title="Indica a quali sessioni puoi venire"
            :description="`${
              home.availability.toConfirm === 1 ? 'C’è una sessione' : `Ci sono ${home.availability.toConfirm} sessioni`
            } in programma per cui indicare se sei disponibile, dal primo all’ultimo giorno: ti convochiamo solo per quelle.`"
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
