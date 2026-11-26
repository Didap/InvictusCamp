<script setup lang="ts">
import type { MyConvocations } from '#shared/types/staff'
import { isConvocationWaiting } from '#shared/utils/session-status'

// Convocations (spec 3.5): only the ones waiting for an answer, accept or decline with a reason (an inactive
// person sees them without the buttons). The sessions accepted, with the contract to sign, are on /staff/sessioni.
const { data, refresh } = await useApiFetch<MyConvocations>('/api/staff/convocations')

const waiting = computed(() => (data.value?.items ?? []).filter(isConvocationWaiting))
</script>

<template>
  <IcPage title="Convocazioni" width="narrow">
    <template v-if="data">
      <UEmpty
        v-if="!waiting.length"
        icon="i-lucide-bell-ring"
        :title="data.approved ? 'Nessuna convocazione da rispondere' : 'Il tuo profilo non è attivo'"
        :description="
          data.approved
            ? 'Quando l’amministrazione ti convoca per una sessione, la trovi qui e ricevi un’email: ti convochiamo solo per le sessioni a cui hai detto che ci sei. Quelle che hai accettato sono in Sessioni.'
            : 'Non ricevi nuove convocazioni. Per tornare attivo scrivi all’amministrazione.'
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
            : []
        "
      />

      <IcSection
        v-else
        title="Da rispondere"
        :description="data.approved ? 'Accetta o rifiuta: l’amministrazione vede subito la tua risposta.' : undefined"
      >
        <div class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <StaffMyConvocation v-for="c in waiting" :key="c.id" :convocation="c" @changed="refresh" />
        </div>
      </IcSection>
    </template>
  </IcPage>
</template>
