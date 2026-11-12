<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { sessionSchema, type SessionInput } from '#shared/schemas/sessions'
import type { ContractOption } from '#shared/types/sessions'
import { DEFAULT_FAMILY_SLOTS, DEFAULT_LOCATION, DEFAULT_STAFF_NEEDED } from '#shared/utils/constants'
import { addDays, isIsoDay, weekdayIndex } from '#shared/utils/dates'

// Create and edit a session (/admin/sessioni/nuova and the Panoramica tab of the session page). The same
// zod schema validates here and on the server.
const props = withDefaults(
  defineProps<{
    initial?: Partial<SessionInput>
    submitLabel: string
    loading?: boolean
    /** Titolari already holding a place: the places cannot go below this. */
    minSlots?: number
    /** Families were already invited: changes reach them only if you write to them. */
    invitationsSent?: boolean
    cancellable?: boolean
  }>(),
  { minSlots: 0 },
)
const emit = defineEmits<{ submit: [values: SessionInput]; cancel: [] }>()

const state = reactive({
  title: props.initial?.title ?? '',
  description: props.initial?.description ?? '',
  location: props.initial?.location ?? DEFAULT_LOCATION,
  startDate: props.initial?.startDate ?? '',
  endDate: props.initial?.endDate ?? '',
  familySlots: props.initial?.familySlots ?? DEFAULT_FAMILY_SLOTS,
  staffNeeded: props.initial?.staffNeeded ?? DEFAULT_STAFF_NEEDED,
  responseDeadline: props.initial?.responseDeadline ?? '',
  contractDocumentId: (props.initial?.contractDocumentId ?? null) as string | null,
  notes: props.initial?.notes ?? '',
})

// The calendar has weekends (Friday to Sunday) and weeks (Monday to Friday): suggest the last day once the
// first is chosen.
watch(
  () => state.startDate,
  start => {
    if (isIsoDay(start) && !state.endDate) state.endDate = addDays(start, weekdayIndex(start) === 4 ? 2 : 4)
  },
)

const { data: contracts } = await useApiFetch<ContractOption[]>('/api/admin/sessions/contract-options', {})
const contractItems = computed(() =>
  (contracts.value ?? [])
    .filter(contract => !contract.archived || contract.id === state.contractDocumentId)
    .map(contract => ({
      value: contract.id,
      label: contract.archived ? `${contract.title} (archiviato)` : contract.title,
    })),
)

const slotsHelp = computed(() =>
  props.minSlots > 0
    ? `Ci sono già ${props.minSlots === 1 ? '1 famiglia titolare' : `${props.minSlots} famiglie titolari`}: i posti non possono essere meno.`
    : 'Le famiglie titolari. Le riserve non occupano posti.',
)

function onSubmit(event: FormSubmitEvent<SessionInput>) {
  emit('submit', event.data)
}
</script>

<template>
  <UForm :schema="sessionSchema" :state="state" class="max-w-2xl space-y-6" @submit="onSubmit">
    <UFormField
      label="Titolo"
      name="title"
      required
      help="Lo leggono famiglie e staff, per esempio «Sessione 19 · Weekend d’autunno»."
    >
      <UInput v-model="state.title" class="w-full" />
    </UFormField>

    <div class="grid gap-6 sm:grid-cols-2">
      <UFormField label="Primo giorno" name="startDate" required>
        <UInput v-model="state.startDate" type="date" class="w-full" />
      </UFormField>
      <UFormField label="Ultimo giorno" name="endDate" required>
        <UInput v-model="state.endDate" type="date" :min="state.startDate || undefined" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="Luogo" name="location" required>
      <UInput v-model="state.location" class="w-full" />
    </UFormField>

    <div class="grid gap-6 sm:grid-cols-2">
      <UFormField label="Posti per le famiglie" name="familySlots" required :help="slotsHelp">
        <UInputNumber v-model="state.familySlots" :min="minSlots" :max="500" class="w-full" />
      </UFormField>
      <UFormField
        label="Persone di staff necessarie"
        name="staffNeeded"
        help="Senza contare il coordinatore dello staff e quello del v-team."
        required
      >
        <UInputNumber v-model="state.staffNeeded" :min="0" :max="500" class="w-full" />
      </UFormField>
    </div>

    <UFormField
      label="Rispondere entro"
      name="responseDeadline"
      hint="Facoltativo"
      help="Il giorno entro cui le famiglie confermano o rinunciano. Possono rispondere anche dopo: lo vedrai segnalato."
    >
      <UInput
        v-model="state.responseDeadline"
        type="date"
        :max="state.startDate || undefined"
        class="w-full sm:w-[calc(50%-0.75rem)]"
      />
    </UFormField>

    <UFormField
      label="Contratto per lo staff"
      name="contractDocumentId"
      hint="Facoltativo"
      help="Chi accetta la convocazione lo riceve da firmare. I contratti si caricano in Documenti, con la categoria Contratto."
    >
      <USelectMenu
        v-model="state.contractDocumentId"
        :items="contractItems"
        value-key="value"
        placeholder="Nessun contratto"
        :search-input="contractItems.length > 8 ? { placeholder: 'Cerca un contratto' } : false"
        clear
        class="w-full"
      />
    </UFormField>

    <UFormField label="Descrizione" name="description" hint="Facoltativo" help="La leggono le famiglie invitate.">
      <UTextarea v-model="state.description" :rows="3" autoresize class="w-full" />
    </UFormField>

    <UFormField
      label="Note interne"
      name="notes"
      hint="Facoltativo"
      help="Solo per l’amministrazione: famiglie e staff non le vedono."
    >
      <UTextarea v-model="state.notes" :rows="3" autoresize class="w-full" />
    </UFormField>

    <UAlert
      v-if="invitationsSent"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Le famiglie sono già state invitate"
      description="Se cambi date o luogo non ricevono avvisi automatici: scrivi loro dalla scheda Comunicazioni."
    />

    <div class="flex flex-wrap gap-3">
      <UButton type="submit" :label="submitLabel" :loading="loading" />
      <UButton v-if="cancellable" color="neutral" variant="outline" label="Annulla" @click="emit('cancel')" />
    </div>
  </UForm>
</template>
