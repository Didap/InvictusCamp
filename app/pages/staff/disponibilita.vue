<script setup lang="ts">
import { availabilitySchema } from '#shared/schemas/staff'
import type { AvailabilityDto, MyAvailability } from '#shared/types/staff'
import { dayCount, todayIso } from '#shared/utils/dates'
import { formatDayRange, plural } from '#shared/utils/format'

// Availability (spec 3.5): the periods, days included, in which the person can come to the camp. The
// administration matches them against the dates of each session. Only approved staff add or remove them.
const api = useApi()
const confirm = useConfirm()
const { data, refresh } = await useApiFetch<MyAvailability>('/api/staff/availability')

const today = todayIso()
const upcoming = computed(() => (data.value?.periods ?? []).filter(period => period.endDate >= today))
const past = computed(() => (data.value?.periods ?? []).filter(period => period.endDate < today).reverse())

const state = reactive({ startDate: '', endDate: '', notes: '' })
const saving = ref(false)
async function add() {
  saving.value = true
  try {
    await api('/api/staff/availability', {
      method: 'POST',
      body: { startDate: state.startDate, endDate: state.endDate, notes: state.notes.trim() || null },
    })
    notifySuccess('Periodo aggiunto', formatDayRange(state.startDate, state.endDate, 'long'))
    Object.assign(state, { startDate: '', endDate: '', notes: '' })
    await refresh()
  } catch (error) {
    notifyError(error, 'Periodo non aggiunto')
  } finally {
    saving.value = false
  }
}

const removing = ref<string | null>(null)
async function remove(period: AvailabilityDto) {
  const range = formatDayRange(period.startDate, period.endDate, 'long')
  const ok = await confirm({
    title: `Togli il periodo ${range}?`,
    description:
      'Non sarai più tra le persone disponibili in quei giorni. Le convocazioni che hai già ricevuto restano.',
    confirmLabel: 'Togli il periodo',
    danger: true,
  })
  if (!ok) return
  removing.value = period.id
  try {
    await api(`/api/staff/availability/${period.id}`, { method: 'DELETE' })
    notifySuccess('Periodo tolto', range)
    await refresh()
  } catch (error) {
    notifyError(error)
  } finally {
    removing.value = null
  }
}
</script>

<template>
  <IcPage title="Disponibilità" width="narrow">
    <template v-if="data">
      <UAlert
        v-if="!data.canEdit"
        color="info"
        variant="subtle"
        icon="i-lucide-calendar-clock"
        title="Disponibile dopo l’approvazione"
        description="Potrai indicare i periodi in cui puoi venire al camp quando la tua candidatura sarà approvata."
      />

      <IcSection
        v-if="data.canEdit || upcoming.length"
        title="I tuoi periodi"
        description="Giorni inclusi. L’amministrazione li usa per convocarti alle sessioni che cadono in quelle date."
      >
        <UEmpty
          v-if="!upcoming.length"
          icon="i-lucide-calendar-plus"
          title="Non hai ancora indicato periodi"
          description="Aggiungi qui sotto i periodi in cui puoi venire al camp: ti convocheremo per le sessioni in quelle date."
          variant="naked"
        />
        <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li
            v-for="period in upcoming"
            :key="period.id"
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
          >
            <div class="min-w-0">
              <p class="font-semibold text-highlighted">
                {{ formatDayRange(period.startDate, period.endDate, 'long') }}
              </p>
              <p class="text-sm text-muted">
                {{ plural(dayCount(period), 'giorno', 'giorni')
                }}<template v-if="period.notes"> · {{ period.notes }}</template>
              </p>
            </div>
            <UButton
              class="pointer-coarse:min-h-11"
              v-if="data.canEdit"
              icon="i-lucide-trash-2"
              label="Togli"
              color="neutral"
              variant="ghost"
              :loading="removing === period.id"
              :aria-label="`Togli il periodo ${formatDayRange(period.startDate, period.endDate, 'long')}`"
              @click="remove(period)"
            />
          </li>
        </ul>
      </IcSection>

      <IcSection v-if="data.canEdit" title="Aggiungi un periodo">
        <UForm :schema="availabilitySchema" :state="state" class="space-y-5" @submit="add">
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Primo giorno" name="startDate" required>
              <UInput v-model="state.startDate" type="date" :min="today" class="w-full" />
            </UFormField>
            <UFormField label="Ultimo giorno" name="endDate" help="Compreso." required>
              <UInput v-model="state.endDate" type="date" :min="state.startDate || today" class="w-full" />
            </UFormField>
          </div>
          <UFormField
            label="Nota"
            name="notes"
            hint="Facoltativo"
            help="Per esempio: arrivo il secondo giorno, oppure solo di pomeriggio."
          >
            <UInput v-model="state.notes" :maxlength="300" class="w-full" />
          </UFormField>
          <UButton
            class="pointer-coarse:min-h-11"
            type="submit"
            icon="i-lucide-calendar-plus"
            label="Aggiungi il periodo"
            size="lg"
            :loading="saving"
          />
        </UForm>
      </IcSection>

      <IcSection v-if="past.length" title="Periodi passati">
        <ul class="space-y-1 text-muted">
          <li v-for="period in past" :key="period.id">
            {{ formatDayRange(period.startDate, period.endDate, 'long') }}
            <template v-if="period.notes"> · {{ period.notes }}</template>
          </li>
        </ul>
      </IcSection>
    </template>
  </IcPage>
</template>
