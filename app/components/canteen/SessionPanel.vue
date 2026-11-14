<script setup lang="ts">
import type { CanteenDto } from '#shared/types/canteen'
import { canteenText } from '#shared/utils/canteen'
import { plural } from '#shared/utils/format'

// The Mensa tab of a session (docs/spec.md 3.14): how many eat at each meal, families and staff, and who
// needs what, with names, to send to the supplier as text or CSV. Health data: administration only.
const props = defineProps<{ sessionId: string }>()

const { data, status, refresh } = useApiFetch<CanteenDto>(() => `/api/admin/sessions/${props.sessionId}/canteen`)

const description = computed(() =>
  data.value
    ? `${plural(data.value.families, 'famiglia', 'famiglie')} e ${plural(data.value.staff, 'persona', 'persone')} dello staff`
    : '',
)

async function copy() {
  if (!data.value) return
  try {
    await navigator.clipboard.writeText(canteenText(data.value.session, data.value))
    notifySuccess('Testo copiato', 'Incollalo nell’email al fornitore dei pasti.')
  } catch (error) {
    notifyError(error, 'Testo non copiato')
  }
}
</script>

<template>
  <div>
    <div v-if="!data && status === 'pending'" class="space-y-3" aria-busy="true">
      <USkeleton class="h-6 w-64" />
      <USkeleton class="h-32 w-full" />
    </div>

    <UAlert
      v-else-if="!data"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare la mensa della sessione"
      description="Controlla la connessione e riprova."
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <IcSection :title="`Totale pasti: ${data.total}`" :description="`Persone a ogni pasto: ${description}.`">
        <template #actions>
          <UButton
            class="pointer-coarse:min-h-11"
            :to="`/api/admin/sessions/${sessionId}/canteen/export`"
            external
            download
            icon="i-lucide-download"
            label="Scarica CSV"
            color="neutral"
            variant="outline"
          />
          <UButton
            class="pointer-coarse:min-h-11"
            icon="i-lucide-copy"
            label="Copia il testo per il fornitore"
            @click="copy"
          />
        </template>

        <UAlert
          v-if="data.withoutCards.length"
          class="mb-6"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`${plural(data.withoutCards.length, 'famiglia', 'famiglie')} senza componenti indicati`"
          :description="`Non sono nel totale finché non compilano i dati: ${data.withoutCards.join(', ')}.`"
        />

        <UEmpty
          v-if="!data.needs.length"
          icon="i-lucide-utensils"
          title="Nessuna esigenza alimentare indicata"
          description="Allergie, intolleranze e preferenze di famiglie e staff compaiono qui quando le indicano."
        />
        <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li v-for="need in data.needs" :key="need.label" class="p-4">
            <p class="font-semibold text-highlighted">{{ need.people.length }} {{ need.label }}</p>
            <p class="text-sm text-muted">{{ need.people.join(', ') }}</p>
          </li>
        </ul>
      </IcSection>

      <IcSection v-if="data.notes.length" title="Da sapere" description="Selettività alimentare e altre note.">
        <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li v-for="note in data.notes" :key="`${note.name}-${note.text}`" class="p-4">
            <p class="font-semibold text-highlighted">{{ note.name }}</p>
            <p class="text-sm">{{ note.text }}</p>
          </li>
        </ul>
      </IcSection>
    </template>
  </div>
</template>
