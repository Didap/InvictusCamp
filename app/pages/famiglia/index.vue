<script setup lang="ts">
import type { FamilyHomeDto } from '#shared/types/families'
import { todayIso } from '#shared/utils/dates'
import { formatDayRange, plural, relativeDay } from '#shared/utils/format'

// The family home: a greeting, what is left to do as a short checklist, the invitations to answer
// (A1's FamilyInvitations) and the next confirmed session.
const { data: home, refresh } = await useApiFetch<FamilyHomeDto>('/api/family/home')

interface Step {
  id: string
  done: boolean
  title: string
  description: string
  to: string
  action: string
}

const steps = computed<Step[]>(() => {
  const h = home.value
  if (!h) return []
  const confirmed = h.formStatus === 'submitted'
  return [
    {
      id: 'familyData',
      done: confirmed,
      title: confirmed ? 'Dati della famiglia confermati' : 'Compila i dati della famiglia',
      description: confirmed
        ? 'Puoi cambiarli quando vuoi.'
        : 'Dove abitate, chi fa parte della famiglia, le sessioni che preferisci.',
      to: '/famiglia/profilo',
      action: 'Compila',
    },
    {
      id: 'cards',
      done: confirmed && h.cardsToComplete === 0,
      title: !confirmed
        ? 'Completa le schede dei componenti'
        : h.cardsToComplete
          ? `Completa ${plural(h.cardsToComplete, 'scheda', 'schede')}`
          : `Schede dei componenti compilate: ${h.memberCount}`,
      description: confirmed
        ? 'Nome, parentela e data di nascita di ogni persona della famiglia.'
        : 'Le creiamo noi, una per persona, quando confermi i dati della famiglia.',
      to: '/famiglia/membri',
      action: 'Compila',
    },
    {
      id: 'consent',
      done: h.healthConsent,
      title: h.healthConsent ? 'Consenso ai dati sulla salute dato' : 'Decidi sul consenso ai dati sulla salute',
      description: h.healthConsent
        ? 'Puoi indicare la disabilità e i bisogni di supporto di ogni componente.'
        : 'Serve per indicare la disabilità e i bisogni di supporto. Puoi ritirarlo quando vuoi.',
      to: '/famiglia/membri#consenso',
      action: 'Leggi',
    },
    {
      id: 'signatures',
      done: h.pendingSignatures === 0,
      title: h.pendingSignatures
        ? `Firma ${plural(h.pendingSignatures, 'documento', 'documenti')}`
        : 'Nessun documento da firmare',
      description: h.pendingSignatures
        ? 'Leggili e firmali con un codice che ricevi via email.'
        : 'Quando il camp te ne chiede uno, lo trovi qui.',
      to: '/famiglia/documenti',
      action: 'Firma',
    },
  ]
})

const doneCount = computed(() => steps.value.filter(step => step.done).length)
/** The first step still to do carries the one primary button of the page. */
const nextStepId = computed(() => steps.value.find(step => !step.done)?.id)

const today = todayIso()
const when = computed(() => {
  const session = home.value?.nextSession
  if (!session) return ''
  return session.startDate <= today ? 'in corso' : relativeDay(session.startDate, today)
})
</script>

<template>
  <IcPage :title="home ? `Ciao ${home.firstName}` : 'Home'" width="narrow">
    <p v-if="home" class="mb-8 max-w-prose text-muted">
      Qui trovi cosa resta da fare per la {{ home.familyName }} e la tua prossima sessione al camp.
    </p>

    <div class="mb-8 empty:hidden">
      <SessionsFamilyInvitations @answered="refresh" />
    </div>

    <IcSection
      title="Cosa fare adesso"
      :description="
        doneCount === steps.length
          ? 'Hai fatto tutto. Ti scriviamo quando ci sono novità.'
          : `${doneCount} di ${steps.length} fatti`
      "
    >
      <ol class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="step in steps" :key="step.id" class="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
          <UIcon
            :name="step.done ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
            class="size-6 shrink-0"
            :class="step.done ? 'text-success' : 'text-warning'"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1 basis-48">
            <p class="font-semibold text-highlighted">{{ step.title }}</p>
            <p class="text-sm text-muted">{{ step.description }}</p>
          </div>
          <UBadge
            v-if="step.done"
            color="success"
            variant="subtle"
            icon="i-lucide-check"
            label="Fatto"
            class="shrink-0"
          />
          <UButton
            v-else
            :to="step.to"
            :label="step.action"
            trailing-icon="i-lucide-arrow-right"
            :color="step.id === nextStepId ? 'primary' : 'neutral'"
            :variant="step.id === nextStepId ? 'solid' : 'outline'"
            class="shrink-0 pointer-coarse:min-h-11"
          />
        </li>
      </ol>
    </IcSection>

    <IcSection title="La tua prossima sessione">
      <div v-if="home?.nextSession" class="rounded-lg border border-default bg-elevated p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-lg font-bold text-highlighted">{{ home.nextSession.title }}</p>
            <p class="mt-1">
              {{ formatDayRange(home.nextSession.startDate, home.nextSession.endDate, 'long') }}
              <span class="text-muted">· {{ when }}</span>
            </p>
            <p class="mt-1 text-muted">{{ home.nextSession.location }}</p>
          </div>
          <IcStatusBadge kind="participationStatus" :value="home.nextSession.status" />
        </div>
      </div>
      <p v-else class="max-w-prose text-muted">
        Non hai ancora una sessione confermata. Quando il camp ti invita a una sessione ricevi un’email e trovi l’invito
        in questa pagina.
      </p>
      <UButton
        to="/famiglia/sessioni"
        label="Vedi le tue sessioni"
        variant="link"
        trailing-icon="i-lucide-arrow-right"
        class="mt-3 px-0 pointer-coarse:min-h-11"
      />
    </IcSection>
  </IcPage>
</template>
