<script setup lang="ts">
import type { MyConvocations } from '#shared/types/staff'
import { todayIso } from '#shared/utils/dates'

// Convocations (spec 3.5): the ones to answer first (accept, or decline with a reason), then the
// accepted ones with the contract to sign, then the history.
const { data, refresh } = await useApiFetch<MyConvocations>('/api/staff/convocations')

const today = todayIso()
const items = computed(() => data.value?.items ?? [])
const toAnswer = computed(() => items.value.filter(c => c.answerable))
const accepted = computed(() =>
  items.value.filter(c => c.status === 'accepted' && c.session.endDate >= today && c.session.status !== 'cancelled'),
)
const history = computed(() =>
  items.value.filter(c => !toAnswer.value.includes(c) && !accepted.value.includes(c)).reverse(),
)
</script>

<template>
  <IcPage title="Convocazioni" width="narrow">
    <template v-if="data">
      <UEmpty
        v-if="!items.length"
        icon="i-lucide-bell-ring"
        :title="data.approved ? 'Nessuna convocazione per ora' : 'Le convocazioni arrivano dopo l’approvazione'"
        :description="
          data.approved
            ? 'Quando l’amministrazione ti convoca per una sessione, la trovi qui e ricevi una email. Tieni aggiornata la tua disponibilità: ti convochiamo nelle date che ci indichi.'
            : 'Quando la tua candidatura sarà approvata, potrai indicare la disponibilità e ricevere le convocazioni alle sessioni.'
        "
        :actions="
          data.approved
            ? [
                {
                  label: 'Aggiorna la disponibilità',
                  icon: 'i-lucide-calendar-check',
                  to: '/staff/disponibilita',
                  class: 'pointer-coarse:min-h-11',
                },
              ]
            : [
                {
                  label: 'Vedi la candidatura',
                  icon: 'i-lucide-file-user',
                  to: '/staff/candidatura',
                  color: 'neutral',
                  variant: 'outline',
                  class: 'pointer-coarse:min-h-11',
                },
              ]
        "
      />

      <template v-else>
        <IcSection
          v-if="toAnswer.length"
          title="Da rispondere"
          description="Accetta o rifiuta: l’amministrazione vede subito la tua risposta."
        >
          <div class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <StaffMyConvocation v-for="c in toAnswer" :key="c.id" :convocation="c" @changed="refresh" />
          </div>
        </IcSection>

        <IcSection
          v-if="accepted.length"
          title="Accettate"
          description="La presenza è confermata quando il contratto, se previsto, è firmato."
        >
          <div class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <StaffMyConvocation v-for="c in accepted" :key="c.id" :convocation="c" @changed="refresh" />
          </div>
        </IcSection>

        <IcSection
          v-if="history.length"
          title="Storico"
          description="Convocazioni rifiutate, annullate o di sessioni passate."
        >
          <div class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <StaffMyConvocation v-for="c in history" :key="c.id" :convocation="c" @changed="refresh" />
          </div>
        </IcSection>
      </template>
    </template>
  </IcPage>
</template>
