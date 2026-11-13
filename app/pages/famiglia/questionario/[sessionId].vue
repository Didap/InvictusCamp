<script setup lang="ts">
import { FEEDBACK_ANSWER_MAX } from '#shared/schemas/feedback'
import type { FamilyFeedbackForm } from '#shared/types/feedback'
import { formatDateTime, formatDayRange } from '#shared/utils/format'

// The end-of-session questionnaire (docs/spec.md 3.13): a vote from 1 to 5 for each activity of the
// session and for reception, spaces and staff, then six written questions. Everything is optional, but
// something must be filled in; once sent it cannot be changed.
const route = useRoute()
const sessionId = String(route.params.sessionId)
const { data, error, refresh } = await useApiFetch<FamilyFeedbackForm>(`/api/family/feedback/${sessionId}`)

const api = useApi()
const confirm = useConfirm()

const NOT_DONE = 'none'
const VOTE_ITEMS = [
  { label: 'Non fatta', value: NOT_DONE },
  ...[1, 2, 3, 4, 5].map(vote => ({ label: String(vote), value: String(vote) })),
]
const votes = reactive<Record<string, string | undefined>>({})
const answers = reactive<Record<string, string>>({})

const activities = computed(() => data.value?.items.filter(item => item.kind === 'activity') ?? [])
const others = computed(() => data.value?.items.filter(item => item.kind === 'other') ?? [])

const payload = computed(() => ({
  votes: Object.fromEntries(
    Object.entries(votes)
      .filter(([, vote]) => vote && vote !== NOT_DONE)
      .map(([label, vote]) => [label, Number(vote)]),
  ),
  answers: Object.fromEntries(
    Object.entries(answers)
      .map(([id, text]) => [id, text.trim()])
      .filter(([, text]) => text),
  ),
}))
const filled = computed(
  () => Object.keys(payload.value.votes).length > 0 || Object.keys(payload.value.answers).length > 0,
)

const sending = ref(false)
async function send() {
  const ok = await confirm({
    title: 'Inviare le risposte?',
    description: 'Dopo l’invio non potrai più cambiarle.',
    confirmLabel: 'Invia',
  })
  if (!ok) return
  sending.value = true
  try {
    const url: string = `/api/family/feedback/${sessionId}`
    await api(url, { method: 'POST', body: payload.value })
    notifySuccess('Risposte inviate', 'Grazie per il tempo che ci hai dedicato.')
    await refresh()
  } catch (error) {
    notifyError(error, 'Risposte non inviate')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <IcPage title="Questionario" back="/famiglia/sessioni" width="narrow">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare il questionario"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else-if="data">
      <p class="mb-8 text-muted">
        <span class="font-semibold text-highlighted">{{ data.session.title }}</span
        >,
        {{ formatDayRange(data.session.startDate, data.session.endDate, 'long') }}
      </p>

      <UEmpty
        v-if="data.sentAt"
        icon="i-lucide-message-square-heart"
        title="Grazie per le tue risposte"
        :description="`Le hai inviate il ${formatDateTime(data.sentAt)}. Ci aiutano a preparare le prossime sessioni.`"
        :actions="[{ label: 'Torna alle sessioni', color: 'neutral', variant: 'outline', to: '/famiglia/sessioni' }]"
      />

      <form v-else class="grid gap-10" @submit.prevent="send">
        <p class="text-pretty">
          Raccontaci com’è andata. Ogni domanda è facoltativa: rispondi solo a quelle che vuoi. Le risposte arrivano
          all’amministrazione del camp senza il nome della tua famiglia e, una volta inviate, non si possono cambiare.
        </p>

        <IcSection
          v-for="group in [
            { title: 'Le attività', items: activities },
            { title: 'Il resto del camp', items: others },
          ].filter(g => g.items.length)"
          :key="group.title"
          :title="group.title"
          description="Un voto da 1 (per niente) a 5 (moltissimo). Se la tua famiglia non l’ha fatta, scegli «Non fatta»."
        >
          <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li v-for="item in group.items" :key="item.label" class="p-4">
              <URadioGroup
                v-model="votes[item.label]"
                :legend="item.label"
                :items="VOTE_ITEMS"
                orientation="horizontal"
                :ui="{ legend: 'mb-2 font-medium text-highlighted', fieldset: 'flex-wrap gap-y-2' }"
              />
            </li>
          </ul>
        </IcSection>

        <IcSection title="Raccontaci">
          <div class="grid gap-6">
            <UFormField v-for="question in data.questions" :key="question.id" :label="question.prompt">
              <UTextarea
                v-model="answers[question.id]"
                :rows="3"
                autoresize
                :maxlength="FEEDBACK_ANSWER_MAX"
                class="w-full"
              />
            </UFormField>
          </div>
        </IcSection>

        <div class="flex flex-wrap items-center gap-4">
          <UButton type="submit" label="Invia le risposte" :loading="sending" :disabled="!filled" />
          <p v-if="!filled" class="text-sm text-muted">Dai almeno un voto o scrivi una risposta.</p>
        </div>
      </form>
    </template>
  </IcPage>
</template>
