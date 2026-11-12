<script setup lang="ts">
import type { MyAvailability, MyAvailabilitySession } from '#shared/types/staff'
import { dayCount } from '#shared/utils/dates'
import { formatDayRange, plural } from '#shared/utils/format'

// Availability (spec 3.5): the sessions not started yet, and for each one whether the person can come to
// the whole of it. The administration convokes only among those who said yes. Only approved staff answer.
const api = useApi()
const confirm = useConfirm()
const { data, refresh } = await useApiFetch<MyAvailability>('/api/staff/availability')

const sessions = computed(() => data.value?.sessions ?? [])
const available = computed(() => sessions.value.filter(session => session.available).length)

const saving = ref<string | null>(null)
async function answer(session: MyAvailabilitySession, value: boolean) {
  if (!value && session.convoked) {
    const ok = await confirm({
      title: `Togli la disponibilità per ${session.title}?`,
      description:
        'Hai già una convocazione per questa sessione: resta com’è, ma l’amministrazione vedrà che hai tolto la disponibilità.',
      confirmLabel: 'Togli la disponibilità',
      danger: true,
    })
    if (!ok) return
  }
  saving.value = session.id
  try {
    const url: string = `/api/staff/availability/${session.id}`
    await api(url, { method: 'PUT', body: { available: value } })
    // The fetched data is a shallow ref: replace it, so the count above follows.
    if (data.value) {
      data.value = {
        ...data.value,
        sessions: data.value.sessions.map(s => (s.id === session.id ? { ...s, available: value } : s)),
      }
    }
    notifySuccess(value ? 'Disponibilità indicata' : 'Disponibilità tolta', session.title)
  } catch (error) {
    notifyError(error, 'Disponibilità non salvata')
    await refresh()
  } finally {
    saving.value = null
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
        description="Potrai indicare a quali sessioni puoi venire quando la tua candidatura sarà approvata."
      />

      <IcSection
        title="Le sessioni"
        :description="
          sessions.length
            ? `Indica le sessioni a cui puoi venire, dal primo all’ultimo giorno: ti convochiamo solo per quelle.${
                available ? ` Ci sei per ${plural(available, 'sessione', 'sessioni')}.` : ''
              }`
            : undefined
        "
      >
        <UEmpty
          v-if="!sessions.length"
          icon="i-lucide-calendar"
          title="Nessuna sessione in programma"
          description="Quando l’amministrazione prepara le prossime sessioni, le trovi qui per indicare la tua disponibilità."
          variant="naked"
        />
        <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li v-for="session in sessions" :key="session.id" class="flex items-start justify-between gap-4 px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-highlighted">{{ session.title }}</p>
              <p class="text-sm text-muted">
                {{ formatDayRange(session.startDate, session.endDate, 'long') }} ·
                {{ plural(dayCount(session), 'giorno', 'giorni') }}
              </p>
              <p v-if="session.convoked" class="text-sm text-muted">Hai già una convocazione per questa sessione.</p>
            </div>
            <USwitch
              :model-value="session.available"
              :disabled="saving === session.id"
              :loading="saving === session.id"
              label="Ci sono"
              class="shrink-0 pt-0.5 pointer-coarse:min-h-11"
              :aria-label="`Ci sono per ${session.title}`"
              @update:model-value="value => answer(session, value)"
            />
          </li>
        </ul>
      </IcSection>
    </template>
  </IcPage>
</template>
