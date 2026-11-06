<script setup lang="ts">
import type { AcceptResult, MyConvocation } from '#shared/types/staff'
import { todayIso } from '#shared/utils/dates'
import { formatDay, formatDayRange } from '#shared/utils/format'
import { isSessionEditable } from '#shared/utils/session-status'

// A convocation as the staff member sees it (spec 3.5): session, dates, place, role, the message of the
// administration; accept or decline (with an optional reason) while it waits; then the contract to sign.
const props = defineProps<{ convocation: MyConvocation; headingLevel?: 2 | 3 }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const confirm = useConfirm()
const { label } = useEnums()
const titleId = useId()

const c = computed(() => props.convocation)
const dates = computed(() => formatDayRange(c.value.session.startDate, c.value.session.endDate, 'long'))
const dayOf = (instant: string | null) => (instant ? formatDay(todayIso(new Date(instant)), 'long') : '')
const sessionOver = computed(() => c.value.session.endDate < todayIso())
// For the person convoked, "Inviata" (the administration's word) means it waits for their answer.
const toAnswer = computed(() => c.value.status === 'sent' && isSessionEditable(c.value.session.status))

const accepting = ref(false)
async function accept() {
  const ok = await confirm({
    title: 'Accetti la convocazione?',
    description: c.value.contractTitle
      ? `«${c.value.session.title}», ${dates.value}. Dopo l’accettazione firmi il contratto «${c.value.contractTitle}»: ti arriva anche una email con il link.`
      : `«${c.value.session.title}», ${dates.value}. L’amministrazione vede subito la tua risposta.`,
    confirmLabel: 'Accetta',
    cancelLabel: 'Torna indietro',
  })
  if (!ok) return
  accepting.value = true
  try {
    const result = await api<AcceptResult>(`/api/staff/convocations/${c.value.id}/accept`, { method: 'POST' })
    notifySuccess(
      'Convocazione accettata',
      result.signatureRequestId ? 'Ora firma il contratto: trovi il pulsante nella convocazione.' : undefined,
    )
    emit('changed')
  } catch (error) {
    notifyError(error)
  } finally {
    accepting.value = false
  }
}

const declineOpen = ref(false)
const reason = ref('')
const declining = ref(false)
watch(declineOpen, value => {
  if (value) reason.value = ''
})
async function decline() {
  declining.value = true
  try {
    await api(`/api/staff/convocations/${c.value.id}/decline`, {
      method: 'POST',
      body: { reason: reason.value.trim() || null },
    })
    notifySuccess('Convocazione rifiutata', 'Grazie per averci avvisato.')
    declineOpen.value = false
    emit('changed')
  } catch (error) {
    notifyError(error)
  } finally {
    declining.value = false
  }
}
</script>

<template>
  <article :aria-labelledby="titleId" class="space-y-4 p-4 sm:p-5">
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div class="min-w-0">
        <component :is="`h${headingLevel ?? 3}`" :id="titleId" class="font-bold text-highlighted">
          {{ c.session.title }}
        </component>
        <p class="text-muted">{{ dates }}</p>
      </div>
      <UBadge
        v-if="toAnswer"
        color="info"
        variant="subtle"
        size="lg"
        icon="i-lucide-reply"
        label="Da rispondere"
        class="shrink-0"
      />
      <StaffConvocationBadge v-else :status="c.status" :confirmed="c.confirmed" />
    </div>

    <dl class="grid gap-x-8 gap-y-2 sm:grid-cols-2">
      <div>
        <dt class="text-sm font-semibold text-muted">Luogo</dt>
        <dd>{{ c.session.location }}</dd>
      </div>
      <div>
        <dt class="text-sm font-semibold text-muted">Ruolo</dt>
        <dd>{{ c.role ? label('staffRole', c.role) : 'Da definire' }}</dd>
      </div>
    </dl>

    <div v-if="c.message" class="max-w-prose rounded-lg bg-muted px-4 py-3">
      <p class="text-sm font-semibold text-muted">Messaggio dell’amministrazione</p>
      <p class="whitespace-pre-line">{{ c.message }}</p>
    </div>

    <template v-if="c.status === 'sent'">
      <p v-if="c.contractTitle" class="text-sm text-muted">
        Se accetti, ti chiederemo di firmare il contratto «{{ c.contractTitle }}».
      </p>
      <div v-if="c.answerable" class="flex flex-wrap gap-2">
        <UButton
          class="pointer-coarse:min-h-11"
          icon="i-lucide-thumbs-up"
          label="Accetta la convocazione"
          size="lg"
          :loading="accepting"
          @click="accept"
        />
        <UButton
          class="pointer-coarse:min-h-11"
          icon="i-lucide-thumbs-down"
          label="Rifiuta"
          color="neutral"
          variant="outline"
          size="lg"
          @click="declineOpen = true"
        />
      </div>
      <p v-else-if="!isSessionEditable(c.session.status)" class="text-sm text-muted">
        La sessione è conclusa o annullata: non serve più rispondere.
      </p>
      <p v-else class="text-sm text-muted">
        Il tuo profilo non è attivo: <IcContactLine as="span" lead="per rispondere" />
      </p>
    </template>

    <template v-else-if="c.status === 'accepted'">
      <p class="text-sm text-muted">Hai accettato il {{ dayOf(c.respondedAt) }}.</p>
      <div
        v-if="c.contract === 'pending' && c.contractRequestId"
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning/10 p-3"
      >
        <p class="flex items-center gap-2 font-semibold text-warning">
          <UIcon name="i-lucide-pen-line" class="size-5 shrink-0" aria-hidden="true" />
          Firma il contratto per confermare la tua presenza.
        </p>
        <UButton
          class="pointer-coarse:min-h-11"
          :to="`/firma/${c.contractRequestId}`"
          icon="i-lucide-signature"
          label="Firma il contratto"
          size="lg"
        />
      </div>
      <p v-else-if="c.contract === 'signed'" class="flex items-center gap-2 text-sm text-success">
        <UIcon name="i-lucide-file-check" class="size-4 shrink-0" aria-hidden="true" />
        Contratto firmato: la tua presenza è confermata.
      </p>
      <p v-else-if="c.contract === 'missing'" class="text-sm text-muted">
        Il contratto da firmare arriverà dall’amministrazione: ti avviseremo per email.
      </p>
      <p v-if="c.session.status === 'cancelled'" class="text-sm font-semibold text-error">
        La sessione è stata annullata.
      </p>
      <p v-else-if="sessionOver" class="text-sm text-muted">Sessione conclusa.</p>
    </template>

    <p v-else-if="c.status === 'declined'" class="text-sm text-muted">
      Hai rifiutato il {{ dayOf(c.respondedAt) }}<template v-if="c.declineReason">: «{{ c.declineReason }}»</template>.
    </p>
    <p v-else-if="c.status === 'cancelled'" class="text-sm text-muted">
      L’amministrazione ha annullato questa convocazione.
    </p>

    <UModal
      v-model:open="declineOpen"
      title="Rifiuti la convocazione?"
      :description="`«${c.session.title}», ${dates}. Se vuoi, scrivi all’amministrazione il motivo.`"
      :ui="{ wrapper: 'pe-12', close: 'pointer-coarse:size-11 pointer-coarse:justify-center' }"
    >
      <template #body>
        <UFormField label="Motivo" hint="Facoltativo" help="Lo legge solo l’amministrazione.">
          <UTextarea v-model="reason" :rows="3" :maxlength="500" autoresize class="w-full" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton
            class="pointer-coarse:min-h-11"
            color="neutral"
            variant="outline"
            label="Torna indietro"
            @click="declineOpen = false"
          />
          <UButton
            class="pointer-coarse:min-h-11"
            color="error"
            label="Rifiuta la convocazione"
            :loading="declining"
            @click="decline"
          />
        </div>
      </template>
    </UModal>
  </article>
</template>
