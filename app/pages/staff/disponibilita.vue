<script setup lang="ts">
import type { MyAvailability, MyAvailabilitySession } from '#shared/types/staff'
import { dayCount } from '#shared/utils/dates'
import { formatDateTime, formatDayRange, plural } from '#shared/utils/format'

// Availability (spec 3.5): the sessions not started yet, and for each one whether the person can come to the whole
// of it. Each answer is saved at once; «Conferma le preferenze» fixes those shown, and only the administration
// reopens them, after «Chiedi il reset». A session not confirmed yet (new, or with new dates) is confirmed in turn.
const api = useApi()
const confirm = useConfirm()
const { data, refresh } = await useApiFetch<MyAvailability>('/api/staff/availability')

const sessions = computed(() => data.value?.sessions ?? [])
const available = computed(() => sessions.value.filter(session => session.available).length)
const hasOpen = computed(() => sessions.value.some(session => !session.locked))

/** The camp's words on what availability is (the docx of 25 November 2026). */
const INTRO =
  'In questa sezione puoi esprimere le tue preferenze. Si tratta di una semplice indicazione di disponibilità, che non costituisce una convocazione ufficiale né comporta alcun vincolo per la Fondazione. In caso di convocazione, riceverai una notifica e un’email ufficiale. Una volta confermate le tue preferenze, per modificare il calendario dovrai richiedere un reset. Ti invitiamo quindi a prenderti tutto il tempo necessario per compilare la sezione con attenzione. «Ci sono» vale per tutta la sessione, dal primo all’ultimo giorno.'
const intro = computed(() =>
  sessions.value.length
    ? `${INTRO}${available.value ? ` Ci sei per ${plural(available.value, 'sessione', 'sessioni')}.` : ''}`
    : undefined,
)

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

async function confirmAll() {
  const ok = await confirm({
    title: 'Confermi le tue preferenze?',
    description: `${
      available.value
        ? `Ci sei per ${plural(available.value, 'sessione', 'sessioni')}`
        : 'Non ci sei per nessuna sessione'
    }. Dopo la conferma, per cambiarle dovrai chiedere un reset all’amministrazione.`,
    confirmLabel: 'Conferma le preferenze',
  })
  if (!ok) return
  saving.value = 'confirm'
  try {
    const sessionIds = sessions.value.filter(session => !session.locked).map(session => session.id)
    await api('/api/staff/availability/confirm', { method: 'POST', body: { sessionIds } })
    notifySuccess('Preferenze confermate')
  } catch (error) {
    notifyError(error, 'Preferenze non confermate')
  } finally {
    await refresh()
    saving.value = null
  }
}

async function requestReset() {
  const ok = await confirm({
    title: 'Chiedi il reset della disponibilità?',
    description:
      'L’amministrazione riceve la richiesta: quando riapre la tua disponibilità ti mandiamo un’email e puoi cambiarla.',
    confirmLabel: 'Chiedi il reset',
  })
  if (!ok) return
  saving.value = 'reset'
  try {
    await api('/api/staff/availability/reset-request', { method: 'POST' })
    notifySuccess('Richiesta inviata')
  } catch (error) {
    notifyError(error, 'Richiesta non inviata')
  } finally {
    await refresh()
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
      <UAlert
        v-else-if="data.confirmedAt"
        class="mb-8"
        color="info"
        variant="subtle"
        icon="i-lucide-calendar-check"
        :title="`Hai confermato le tue preferenze il ${formatDateTime(data.confirmedAt)}`"
      >
        <template #description>
          <template v-if="data.resetRequestedAt">
            Hai chiesto il reset il {{ formatDateTime(data.resetRequestedAt) }}: quando l’amministrazione riapre la
            disponibilità ti mandiamo un’email.
          </template>
          <template v-else>Per cambiarle chiedi il reset all’amministrazione.</template>
        </template>
        <template v-if="!data.resetRequestedAt" #actions>
          <UButton
            label="Chiedi il reset"
            color="neutral"
            variant="outline"
            :loading="saving === 'reset'"
            class="pointer-coarse:min-h-11"
            @click="requestReset"
          />
        </template>
      </UAlert>

      <IcSection title="Le sessioni" :description="intro">
        <UEmpty
          v-if="!sessions.length"
          icon="i-lucide-calendar"
          title="Nessuna sessione in programma"
          description="Quando l’amministrazione prepara le prossime sessioni, le trovi qui per indicare la tua disponibilità."
          variant="naked"
        />
        <template v-else>
          <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li v-for="session in sessions" :key="session.id" class="flex items-start justify-between gap-4 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-highlighted">{{ session.title }}</p>
                <p class="text-sm text-muted">
                  {{ formatDayRange(session.startDate, session.endDate, 'long') }} ·
                  {{ plural(dayCount(session), 'giorno', 'giorni') }}
                </p>
                <p v-if="session.convoked" class="text-sm text-muted">Hai già una convocazione per questa sessione.</p>
                <p v-else-if="data.confirmedAt && !session.locked" class="text-sm text-muted">Da confermare.</p>
              </div>
              <USwitch
                :model-value="session.available"
                :disabled="session.locked || saving !== null"
                :loading="saving === session.id"
                label="Ci sono"
                class="shrink-0 pt-0.5 pointer-coarse:min-h-11"
                :aria-label="`Ci sono per ${session.title}`"
                @update:model-value="value => answer(session, value)"
              />
            </li>
          </ul>
          <div v-if="hasOpen" class="mt-6 flex justify-end">
            <UButton
              label="Conferma le preferenze"
              icon="i-lucide-calendar-check"
              :loading="saving === 'confirm'"
              class="pointer-coarse:min-h-11"
              @click="confirmAll"
            />
          </div>
        </template>
      </IcSection>
    </template>
  </IcPage>
</template>
