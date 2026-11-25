<script setup lang="ts">
import type { MyConvocations } from '#shared/types/staff'

// Convocations (spec 3.5): only the ones to answer, accept or decline with a reason. The sessions accepted, with
// the contract to sign, are on /staff/sessioni.
const { data, refresh } = await useApiFetch<MyConvocations>('/api/staff/convocations')

const toAnswer = computed(() => (data.value?.items ?? []).filter(c => c.answerable))
</script>

<template>
  <IcPage title="Convocazioni" width="narrow">
    <template v-if="data">
      <UEmpty
        v-if="!toAnswer.length"
        icon="i-lucide-bell-ring"
        :title="data.approved ? 'Nessuna convocazione da rispondere' : 'Le convocazioni arrivano dopo l’approvazione'"
        :description="
          data.approved
            ? 'Quando l’amministrazione ti convoca per una sessione, la trovi qui e ricevi un’email. Le sessioni che hai accettato sono in Sessioni.'
            : 'Quando la tua candidatura sarà approvata, potrai indicare la disponibilità e ricevere le convocazioni alle sessioni.'
        "
        :actions="
          data.approved
            ? [
                {
                  label: 'Vai alle sessioni',
                  icon: 'i-lucide-calendar-days',
                  to: '/staff/sessioni',
                  color: 'neutral',
                  variant: 'outline',
                  class: 'pointer-coarse:min-h-11',
                },
              ]
            : [
                {
                  label: 'Vedi la scheda personale',
                  icon: 'i-lucide-id-card',
                  to: '/staff/scheda',
                  color: 'neutral',
                  variant: 'outline',
                  class: 'pointer-coarse:min-h-11',
                },
              ]
        "
      />

      <IcSection
        v-else
        title="Da rispondere"
        description="Accetta o rifiuta: l’amministrazione vede subito la tua risposta."
      >
        <div class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <StaffMyConvocation v-for="c in toAnswer" :key="c.id" :convocation="c" @changed="refresh" />
        </div>
      </IcSection>
    </template>
  </IcPage>
</template>
