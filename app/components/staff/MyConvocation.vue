<script setup lang="ts">
import type { AcceptResult, MyConvocation } from '#shared/types/staff'
import { formatDayRange } from '#shared/utils/format'

// A convocation waiting for an answer (spec 3.5): session, dates, place, role, the message of the administration;
// accept (then the contract to sign, if any) or decline with an optional reason. Once answered it lives on
// /staff/sessioni.
const props = defineProps<{ convocation: MyConvocation; headingLevel?: 2 | 3 }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const confirm = useConfirm()
const titleId = useId()

const c = computed(() => props.convocation)
const dates = computed(() => formatDayRange(c.value.session.startDate, c.value.session.endDate, 'long'))

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
    // It leaves the list of those to answer: the contract is signed right away, or the session is in Sessioni.
    const requestId = result.signatureRequestId
    notifySuccess(
      'Convocazione accettata',
      requestId ? 'Ora firma il contratto.' : undefined,
      requestId ? undefined : { label: 'Vai a Sessioni', to: '/staff/sessioni' },
    )
    if (requestId) await navigateTo(`/firma/${requestId}`)
    else emit('changed')
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
      <UBadge color="info" variant="subtle" size="lg" icon="i-lucide-reply" label="Da rispondere" class="shrink-0" />
    </div>

    <dl class="grid gap-x-8 gap-y-2 sm:grid-cols-2">
      <div>
        <dt class="text-sm font-semibold text-muted">Luogo</dt>
        <dd>{{ c.session.location }}</dd>
      </div>
      <div>
        <dt class="text-sm font-semibold text-muted">Ruolo</dt>
        <dd>{{ c.roleName ?? 'Da definire' }}</dd>
      </div>
    </dl>

    <div v-if="c.message" class="max-w-prose rounded-lg bg-muted px-4 py-3">
      <p class="text-sm font-semibold text-muted">Messaggio dell’amministrazione</p>
      <p class="whitespace-pre-line">{{ c.message }}</p>
    </div>

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
    <p v-else class="text-sm text-muted">
      Il tuo profilo non è attivo: <IcContactLine as="span" lead="per rispondere" />
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
