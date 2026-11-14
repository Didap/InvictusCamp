<script setup lang="ts">
import { FEEDBACK_ANSWER_MAX, feedbackAnswerSchema } from '#shared/schemas/feedback'
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

// No vote: an activity the family did not do, or something it cannot judge.
const NO_VOTE = 'none'
const voteItems = (none: string) => [
  { label: none, value: NO_VOTE },
  ...[1, 2, 3, 4, 5].map(vote => ({ label: String(vote), value: String(vote) })),
]
const SCALE = 'Un voto da 1 (per niente) a 5 (moltissimo).'
const votes = reactive<Record<string, string | undefined>>({})
const answers = reactive<Record<string, string>>({})

const groups = computed(() =>
  [
    {
      title: 'Le attività',
      description: `${SCALE} Se la tua famiglia non l’ha fatta, scegli «Non fatta».`,
      options: voteItems('Non fatta'),
      items: data.value?.items.filter(item => item.kind === 'activity') ?? [],
    },
    {
      title: 'Il resto del camp',
      description: `${SCALE} Se non sai cosa rispondere, scegli «Non so».`,
      options: voteItems('Non so'),
      items: data.value?.items.filter(item => item.kind === 'other') ?? [],
    },
  ].filter(group => group.items.length),
)

const payload = computed(() => ({
  votes: Object.fromEntries(
    Object.entries(votes)
      .filter(([, vote]) => vote && vote !== NO_VOTE)
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
  const parsed = feedbackAnswerSchema.safeParse(payload.value)
  if (!parsed.success) return notifyError(parsed.error, 'Risposte non inviate')
  const ok = await confirm({
    title: 'Inviare le risposte?',
    description: 'Dopo l’invio non potrai più cambiarle.',
    confirmLabel: 'Invia',
  })
  if (!ok) return
  sending.value = true
  try {
    const url: string = `/api/family/feedback/${sessionId}`
    await api(url, { method: 'POST', body: parsed.data })
    notifySuccess('Risposte inviate', 'Grazie per il tempo che ci hai dedicato.')
    await refresh()
  } catch (error) {
    notifyError(error, 'Risposte non inviate')
    // Sent meanwhile from another device: the page turns to the thanks.
    await refresh()
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

        <IcSection v-for="group in groups" :key="group.title" :title="group.title" :description="group.description">
          <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li v-for="item in group.items" :key="item.label" class="p-4">
              <URadioGroup
                v-model="votes[item.label]"
                :legend="item.label"
                :items="group.options"
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
