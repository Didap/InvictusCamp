<script setup lang="ts">
import { contactSentence } from '~/components/ic/ContactLine.vue'
import type { FamilySessionItem } from '#shared/types/sessions'
import { todayIso } from '#shared/utils/dates'
import { formatDay, formatDayRange } from '#shared/utils/format'
import { canFamilyReadProgramme } from '#shared/utils/programme'

// A session as the family sees it: dates, place, where the family stands and, while an invitation is
// open, "Conferma la partecipazione" and "Rinuncia" (docs/spec.md 3.3). Phone first: big targets.
const props = defineProps<{ item: FamilySessionItem }>()
const emit = defineEmits<{ answered: [] }>()

const api = useApi()
const confirm = useConfirm()
const contact = useContact('families')
const titleId = useId()
const saving = ref(false)
const declineOpen = ref(false)

const range = computed(() => formatDayRange(props.item.startDate, props.item.endDate, 'long'))
const waitingReserve = computed(() => props.item.kind === 'reserve' && props.item.status === 'invited')
// The same rule the server applies (server/domain/programmes.ts, familyProgramme).
const showProgramme = computed(() => canFamilyReadProgramme(props.item.status, props.item.sessionStatus))
// Confirmed and not over yet: the family must know how to tell the camp it can no longer come.
const canStillCancel = computed(() => props.item.status === 'confirmed' && props.item.sessionStatus !== 'completed')

const message = computed(() => {
  const { item } = props
  if (item.status === 'cancelled') {
    return item.sessionStatus === 'cancelled'
      ? 'La sessione è stata annullata e non si terrà.'
      : 'La partecipazione della tua famiglia è stata annullata dall’amministrazione del camp.'
  }
  if (item.status === 'declined') {
    return `Hai rinunciato${item.respondedAt ? ` il ${formatDay(todayIso(new Date(item.respondedAt)), 'long')}` : ''}.`
  }
  if (waitingReserve.value) {
    return 'La tua famiglia è in lista di riserva. Se si libera un posto ti scriviamo e potrai confermare da qui.'
  }
  if (item.status === 'confirmed') {
    if (item.sessionStatus === 'completed') return 'La sessione è conclusa. Grazie di aver partecipato.'
    return item.sessionStatus === 'confirmed'
      ? 'La sessione è confermata: ti aspettiamo al camp con la tua famiglia.'
      : 'Hai confermato la partecipazione. Ti scriviamo quando la sessione è confermata.'
  }
  if (item.canConfirm) {
    return 'La tua famiglia è invitata a partecipare.'
  }
  return 'La sessione non accetta più risposte.'
})

const deadline = computed(() => {
  const day = props.item.responseDeadline
  if (!props.item.canConfirm || !day) return null
  return day >= todayIso()
    ? `Rispondi entro il ${formatDay(day, 'long')}`
    : `Il termine era il ${formatDay(day, 'long')}: puoi rispondere lo stesso.`
})

async function answer(value: { answer: 'confirmed' | 'declined'; reason: string | null }) {
  saving.value = true
  try {
    await api(`/api/family/sessions/${props.item.id}/answer`, { method: 'POST', body: value })
    if (value.answer === 'confirmed') notifySuccess('Partecipazione confermata', 'Grazie: ti aspettiamo al camp.')
    else
      notifySuccess(
        props.item.kind === 'slot' ? 'Hai rinunciato al posto' : 'La tua famiglia non è più in lista di riserva',
      )
    declineOpen.value = false
    await refreshNuxtData('family-sessions')
    emit('answered')
  } catch (error) {
    notifyError(error, 'Risposta non inviata')
  } finally {
    saving.value = false
  }
}

async function confirmPlace() {
  const ok = await confirm({
    title: 'Confermi la partecipazione?',
    description: `La tua famiglia partecipa a «${props.item.title}», ${range.value}. ${contactSentence(contact.value, 'Se poi non potete più venire')}`,
    confirmLabel: 'Conferma',
    cancelLabel: 'Torna indietro',
  })
  if (ok) await answer({ answer: 'confirmed', reason: null })
}
</script>

<template>
  <article
    :id="`sessione-${item.sessionId}`"
    :aria-labelledby="titleId"
    class="scroll-mt-6 rounded-lg border border-default bg-elevated p-5 sm:p-6"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <h3 :id="titleId" class="text-lg font-bold text-highlighted">{{ item.title }}</h3>
      <IcStatusBadge v-if="waitingReserve" kind="participationKind" value="reserve" />
      <IcStatusBadge v-else kind="participationStatus" :value="item.status" />
    </div>
    <p class="mt-2 font-semibold text-highlighted">{{ range }}</p>
    <p class="text-muted">{{ item.location }}</p>
    <p v-if="item.description" class="mt-3 max-w-prose">{{ item.description }}</p>
    <p class="mt-4 max-w-prose">{{ message }}</p>
    <IcContactLine v-if="canStillCancel" lead="Se non puoi più partecipare" class="mt-1 max-w-prose" />
    <p v-if="item.status === 'declined' && item.declineReason" class="mt-1 max-w-prose text-sm text-muted">
      Motivo: {{ item.declineReason }}
    </p>
    <p v-if="deadline" class="mt-3 flex items-center gap-2 font-semibold text-highlighted">
      <UIcon name="i-lucide-calendar-clock" class="size-5 shrink-0 text-muted" aria-hidden="true" />
      {{ deadline }}
    </p>

    <UButton
      v-if="showProgramme"
      :to="`/famiglia/programma/${item.sessionId}`"
      icon="i-lucide-calendar-clock"
      label="Il programma della settimana"
      color="neutral"
      variant="outline"
      class="mt-4 pointer-coarse:min-h-11"
    />

    <div v-if="item.canConfirm || item.canDecline" class="mt-5 flex flex-col gap-3 sm:flex-row">
      <UButton
        v-if="item.canConfirm"
        size="lg"
        icon="i-lucide-circle-check"
        label="Conferma la partecipazione"
        class="justify-center"
        :loading="saving"
        @click="confirmPlace"
      />
      <UButton
        v-if="item.canDecline"
        size="lg"
        color="neutral"
        variant="outline"
        :label="item.kind === 'slot' ? 'Rinuncia' : 'Esci dalla lista di riserva'"
        class="justify-center"
        :disabled="saving"
        @click="declineOpen = true"
      />
    </div>

    <SessionsAnswerModal
      v-model:open="declineOpen"
      :title="item.kind === 'slot' ? `Rinunci a «${item.title}»?` : 'Esci dalla lista di riserva?'"
      :answers="['declined']"
      :submit-label="item.kind === 'slot' ? 'Rinuncia al posto' : 'Esci dalla lista'"
      :loading="saving"
      reason-help="Se vuoi, scrivi il motivo: lo legge solo l’amministrazione del camp. Non servono dettagli sulla salute."
      @submit="answer"
    >
      <template #description>
        {{
          item.kind === 'slot'
            ? 'Il posto passa a un’altra famiglia in attesa.'
            : `La tua famiglia non sarà più in lista di riserva per «${item.title}».`
        }}
        <IcContactLine as="span" lead="Se cambi idea" />
      </template>
    </SessionsAnswerModal>
  </article>
</template>
