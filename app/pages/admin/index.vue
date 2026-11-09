<script setup lang="ts">
import { FAILED_EMAIL_DAYS, type DashboardDto } from '#shared/types/dashboard'
import { formatNumber } from '#shared/utils/format'

// Panoramica (docs/spec.md, 3.9): the next session, the numbers that lead to action (each one opens
// its list), what to do now, the sessions to come with their progress. A number is not repeated in
// "Da fare"; emails not delivered get a tile only when there are some, otherwise one quiet line.
const { data, error, refresh } = await useApiFetch<DashboardDto>('/api/admin/dashboard')

const others = computed(() => data.value?.upcoming.filter(s => s.id !== data.value?.nextSession?.id) ?? [])

const tiles = computed(() => {
  const counts = data.value?.counts
  if (!counts) return []
  return [
    {
      label: 'Candidature da valutare',
      value: formatNumber(counts.applicationsToReview),
      hint: 'Staff in attesa dell’esito',
      icon: 'i-lucide-inbox',
      to: '/admin/staff?tab=review',
    },
    {
      label: 'Dati della famiglia da confermare',
      value: formatNumber(counts.formsToComplete),
      hint: 'Famiglie che non li hanno ancora confermati',
      icon: 'i-lucide-file-pen-line',
      to: '/admin/famiglie?formStatus=draft',
    },
    {
      label: 'Firme in attesa',
      value: formatNumber(counts.signaturesPending),
      hint: 'Documenti assegnati da firmare',
      icon: 'i-lucide-pen-line',
      to: '/admin/documenti',
    },
    ...(counts.emailsFailed
      ? [
          {
            label: 'Email non recapitate',
            value: formatNumber(counts.emailsFailed),
            hint: `Negli ultimi ${FAILED_EMAIL_DAYS} giorni: controlla gli indirizzi`,
            icon: 'i-lucide-mail-warning',
            to: `/admin/comunicazioni?tab=registro&status=failed&days=${FAILED_EMAIL_DAYS}`,
          },
        ]
      : []),
  ]
})
</script>

<template>
  <IcPage title="Panoramica" width="wide">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare la panoramica"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else-if="data">
      <IcSection title="Prossima sessione">
        <template v-if="data.nextSession" #actions>
          <UButton
            :to="`/admin/sessioni/${data.nextSession.id}`"
            label="Apri la sessione"
            trailing-icon="i-lucide-arrow-right"
            color="neutral"
            variant="outline"
          />
        </template>
        <div v-if="data.nextSession" class="rounded-lg border border-default bg-elevated p-5 sm:p-6">
          <DashboardSessionProgress :session="data.nextSession" :today="data.today" />
        </div>
        <UEmpty
          v-else
          icon="i-lucide-calendar-plus"
          title="Nessuna sessione in programma"
          description="Crea la prossima sessione del camp: date, posti per le famiglie e staff necessario."
          :actions="[{ label: 'Crea una sessione', icon: 'i-lucide-plus', to: '/admin/sessioni/nuova' }]"
        />
      </IcSection>

      <IcSection title="Da seguire" description="Ogni numero apre l’elenco da cui partire.">
        <div :class="['grid gap-4', tiles.length > 3 ? 'sm:grid-cols-2 2xl:grid-cols-4' : 'md:grid-cols-3']">
          <IcStatCard v-for="tile in tiles" :key="tile.label" v-bind="tile" />
        </div>
        <p v-if="!data.counts.emailsFailed" class="mt-4 flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-mail-check" class="size-5 shrink-0 text-success" aria-hidden="true" />
          Nessuna email non recapitata negli ultimi {{ FAILED_EMAIL_DAYS }} giorni.
        </p>
      </IcSection>

      <IcSection title="Da fare">
        <DashboardTodoList :items="data.todo" />
      </IcSection>

      <IcSection title="Le altre sessioni in arrivo">
        <template #actions>
          <UButton to="/admin/sessioni" label="Tutte le sessioni" color="neutral" variant="ghost" />
        </template>
        <ul v-if="others.length" class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li v-for="session in others" :key="session.id" class="p-5 sm:p-6">
            <DashboardSessionProgress :session="session" :today="data.today" />
          </li>
        </ul>
        <p v-else class="text-muted">Nessun’altra sessione in programma dopo la prossima.</p>
      </IcSection>
    </template>
  </IcPage>
</template>
