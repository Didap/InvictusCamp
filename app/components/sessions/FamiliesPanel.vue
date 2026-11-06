<script setup lang="ts">
import type { ParticipationActionResult, SessionFamiliesDto, SessionFamilyItem } from '#shared/types/sessions'
import type { ParticipationKind } from '#shared/utils/constants'
import { isSessionEditable, isSessionOpen } from '#shared/utils/session-status'
import { holdsSlot, isWaitingReserve } from '#shared/utils/slots'

// CONTRACT (docs/BUILD.md): owned by A1 Sessioni. Admin session page, tab "Famiglie": titolari and
// reserves with their status, add families, call a reserve, reorder reserves, record an answer by
// phone, remove, resend the invitation (docs/spec.md 3.3). Emits `changed` after every change, so the
// page can refresh its counts.
const props = defineProps<{ sessionId: string }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const confirm = useConfirm()
const base = computed(() => `/api/admin/sessions/${props.sessionId}`)

const { data, error, refresh } = await useApiFetch<SessionFamiliesDto>(() => `${base.value}/families`, {
  key: `session-families-${props.sessionId}`,
})

const participations = computed(() => data.value?.participations ?? [])
const titolari = computed(() => participations.value.filter(holdsSlot))
const reserves = computed(() => participations.value.filter(isWaitingReserve))
const gone = computed(() => participations.value.filter(p => !holdsSlot(p) && !isWaitingReserve(p)))
const slots = computed(() => data.value?.slots ?? { total: 0, held: 0, confirmed: 0, free: 0, reserves: 0 })
const editable = computed(() => !!data.value && isSessionEditable(data.value.status))
const open = computed(() => !!data.value && isSessionOpen(data.value.status))
const cancelled = computed(() => data.value?.status === 'cancelled')
const canCall = computed(() => editable.value && slots.value.free > 0)
const writeLink = computed(() => ({
  path: '/admin/comunicazioni/nuova',
  query: { audience: 'session_families', sessionId: props.sessionId },
}))

const busy = ref(false)
const announcement = ref('')

async function changed() {
  await refresh()
  emit('changed')
}

/** Runs one action on the server, with a toast for the outcome. */
async function run<T>(action: () => Promise<T>, failure: string, success?: (result: T) => [string, string?]) {
  busy.value = true
  try {
    const result = await action()
    if (success) notifySuccess(...success(result))
    await changed()
    return result
  } catch (error) {
    notifyError(error, failure)
  } finally {
    busy.value = false
  }
}

const emailsLeave = (count: number) =>
  count === 0 ? 'Non partirà nessuna email.' : count === 1 ? 'Partirà 1 email.' : `Partiranno ${count} email.`

// ─── Add ───────────────────────────────────────────────────────────────────────────────────────────

const addOpen = ref(false)
const addKind = ref<ParticipationKind | undefined>()
function openAdd(kind?: ParticipationKind) {
  addKind.value = kind
  addOpen.value = true
}

// ─── Call a reserve ────────────────────────────────────────────────────────────────────────────────

async function callReserve(target?: SessionFamilyItem) {
  const family = target ?? reserves.value[0]
  if (!family) return
  const sends = open.value && family.accountStatus !== 'disabled'
  const ok = await confirm({
    title: `Chiami ${family.familyName}?`,
    description: open.value
      ? `${family.familyName} diventa titolare del posto libero e riceve l’email «Si è liberato un posto» per confermare o rinunciare. ${emailsLeave(sends ? 1 : 0)}`
      : `${family.familyName} diventa titolare del posto libero. La sessione è in bozza: riceverà l’invito quando apri gli inviti. ${emailsLeave(0)}`,
    confirmLabel: 'Chiama la riserva',
  })
  if (!ok) return
  await run(
    () =>
      api<ParticipationActionResult>(`${base.value}/call-reserve`, {
        method: 'POST',
        body: { participationId: family.id },
      }),
    'Riserva non chiamata',
    result => [
      `${family.familyName} ora è titolare`,
      result.emails ? 'Le abbiamo scritto per confermare o rinunciare.' : undefined,
    ],
  )
}

// ─── Reorder the reserves ──────────────────────────────────────────────────────────────────────────

async function move(item: SessionFamilyItem, delta: -1 | 1) {
  const order = reserves.value.map(reserve => reserve.id)
  const from = order.indexOf(item.id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= order.length) return
  order.splice(from, 1)
  order.splice(to, 0, item.id)
  // A plain string URL: the typed $fetch would otherwise try every route against the template.
  const url: string = `${base.value}/reserves`
  const done = await run(() => api<{ ok: boolean }>(url, { method: 'PUT', body: { order } }), 'Ordine non cambiato')
  if (done) announcement.value = `${item.familyName} ora è la riserva numero ${to + 1}.`
}

// ─── Answer by phone ───────────────────────────────────────────────────────────────────────────────

const answering = ref<SessionFamilyItem | null>(null)
const answerOpen = ref(false)
const answerOptions = computed<('confirmed' | 'declined')[]>(() =>
  answering.value?.kind === 'slot' && answering.value.status === 'invited' ? ['confirmed', 'declined'] : ['declined'],
)

function openAnswer(item: SessionFamilyItem) {
  answering.value = item
  answerOpen.value = true
}

async function saveAnswer(value: { answer: 'confirmed' | 'declined'; reason: string | null }) {
  const item = answering.value
  if (!item) return
  const done = await run(
    () =>
      api<ParticipationActionResult>(`${base.value}/families/${item.id}/answer`, {
        method: 'POST',
        body: value,
      }),
    'Risposta non registrata',
    () => [
      'Risposta registrata',
      value.answer === 'declined' && item.kind === 'slot' ? 'Il posto è libero: puoi chiamare una riserva.' : undefined,
    ],
  )
  if (done) answerOpen.value = false
}

// ─── Resend, remove ────────────────────────────────────────────────────────────────────────────────

async function resend(item: SessionFamilyItem) {
  const ok = await confirm({
    title: item.kind === 'slot' ? 'Invii di nuovo l’invito?' : 'Invii di nuovo l’avviso?',
    description: `${item.familyName} riceve di nuovo ${
      item.kind === 'slot' ? 'l’invito a confermare o rinunciare' : 'l’avviso di essere in lista di riserva'
    } all’indirizzo ${item.email}. Partirà 1 email.`,
    confirmLabel: 'Invia',
  })
  if (!ok) return
  await run(
    () => api<ParticipationActionResult>(`${base.value}/families/${item.id}/resend`, { method: 'POST' }),
    'Invito non inviato',
    () => ['Email inviata', `A ${item.familyName}.`],
  )
}

async function remove(item: SessionFamilyItem) {
  const sends = item.status !== 'selected' && item.accountStatus !== 'disabled'
  const what = item.kind === 'slot' ? 'dalla sessione' : 'dalla lista di riserva'
  const ok = await confirm({
    title: `Togli ${item.familyName} ${what}?`,
    description: [
      item.kind === 'slot'
        ? 'Il suo posto si libera.'
        : reserves.value.at(-1)?.id === item.id
          ? ''
          : 'Le riserve dopo di lei salgono di una posizione.',
      sends
        ? 'La famiglia riceve un’email che la avvisa. Partirà 1 email.'
        : item.status === 'selected'
          ? 'Non era ancora stata invitata: non partirà nessuna email.'
          : 'L’account è disattivato: non partirà nessuna email.',
    ]
      .filter(Boolean)
      .join(' '),
    confirmLabel: 'Togli',
    cancelLabel: 'Torna indietro',
    danger: true,
  })
  if (!ok) return
  await run(
    () => api<ParticipationActionResult>(`${base.value}/families/${item.id}/cancel`, { method: 'POST' }),
    'Famiglia non tolta',
    result => [
      `${item.familyName} non è più ${what.replace('dalla', 'nella')}`,
      result.emails ? 'Le abbiamo scritto.' : undefined,
    ],
  )
}
</script>

<template>
  <div>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare le famiglie della sessione"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else-if="data">
      <UAlert
        v-if="cancelled"
        color="neutral"
        variant="subtle"
        icon="i-lucide-circle-x"
        class="mb-8"
        title="La sessione è annullata"
        description="Nessuna famiglia occupa più un posto. Quelle che erano nella sessione sono qui sotto."
      />
      <div v-else class="mb-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <p class="text-highlighted">
          <strong class="tabular-nums">{{ slots.held }} di {{ slots.total }}</strong> posti occupati ·
          <span class="tabular-nums">{{ slots.confirmed }}</span>
          {{ slots.confirmed === 1 ? 'confermata' : 'confermate' }} · <span class="tabular-nums">{{ slots.free }}</span>
          {{ slots.free === 1 ? 'libero' : 'liberi' }} ·
          <span class="tabular-nums">{{ slots.reserves }}</span>
          {{ slots.reserves === 1 ? 'riserva in attesa' : 'riserve in attesa' }}
        </p>
        <!-- The solid primary of the page is the status move in its header: these stay outlined. -->
        <div class="flex flex-wrap gap-2 xl:shrink-0">
          <UButton
            v-if="canCall && reserves.length"
            icon="i-lucide-user-round-check"
            label="Chiama la riserva"
            variant="outline"
            :disabled="busy"
            @click="callReserve()"
          />
          <UButton
            v-if="editable"
            icon="i-lucide-plus"
            label="Aggiungi famiglie"
            :color="canCall && reserves.length ? 'neutral' : 'primary'"
            variant="outline"
            @click="openAdd()"
          />
          <UButton :to="writeLink" icon="i-lucide-mail" label="Scrivi alle famiglie" color="neutral" variant="ghost" />
        </div>
      </div>

      <UAlert
        v-if="data.status === 'draft' && participations.length"
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        class="mb-8"
        title="La sessione è in bozza"
        description="Le famiglie non hanno ancora ricevuto nulla: l’invito parte quando apri gli inviti."
      />

      <IcSection
        v-if="!cancelled"
        title="Titolari"
        :description="`Occupano i ${slots.total} posti della sessione. Chi rinuncia libera il posto per una riserva.`"
      >
        <SessionsParticipationList
          v-if="titolari.length"
          :items="titolari"
          variant="titolari"
          caption="Famiglie titolari"
          :editable="editable"
          :open="open"
          :can-call="canCall"
          :busy="busy"
          @answer="openAnswer"
          @resend="resend"
          @remove="remove"
        />
        <UEmpty
          v-else
          icon="i-lucide-user-plus"
          title="Nessuna famiglia titolare"
          :description="
            editable
              ? 'Aggiungi le famiglie che occupano i posti della sessione.'
              : 'Nessuna famiglia ha occupato i posti di questa sessione.'
          "
          :actions="
            editable ? [{ label: 'Aggiungi titolari', icon: 'i-lucide-plus', onClick: () => openAdd('slot') }] : []
          "
        />
      </IcSection>

      <IcSection
        v-if="!cancelled"
        title="Riserve"
        description="Le chiami tu, in quest’ordine, quando si libera un posto. Con le frecce cambi l’ordine."
      >
        <SessionsParticipationList
          v-if="reserves.length"
          :items="reserves"
          variant="reserves"
          caption="Riserve in ordine di chiamata"
          :editable="editable"
          :open="open"
          :can-call="canCall"
          :busy="busy"
          @answer="openAnswer"
          @resend="resend"
          @remove="remove"
          @call="callReserve"
          @move="move"
        />
        <UEmpty
          v-else
          icon="i-lucide-list-ordered"
          title="Nessuna riserva"
          :description="
            editable
              ? 'Le riserve aspettano un posto libero: quando una famiglia rinuncia, chiami la prima della lista.'
              : 'Nessuna famiglia è in lista di riserva.'
          "
          :actions="
            editable
              ? [
                  {
                    label: 'Aggiungi riserve',
                    icon: 'i-lucide-plus',
                    color: 'neutral',
                    variant: 'outline',
                    onClick: () => openAdd('reserve'),
                  },
                ]
              : []
          "
        />
      </IcSection>

      <IcSection
        v-if="gone.length"
        :title="cancelled ? 'Famiglie della sessione' : 'Rinunce e famiglie tolte'"
        :description="cancelled ? undefined : 'Non occupano posti. Puoi aggiungerle di nuovo con «Aggiungi famiglie».'"
      >
        <SessionsParticipationList
          :items="gone"
          variant="gone"
          caption="Famiglie che hanno rinunciato o sono state tolte"
          :editable="editable"
          :open="open"
          :can-call="false"
          :busy="busy"
        />
      </IcSection>

      <p class="sr-only" aria-live="polite">{{ announcement }}</p>

      <SessionsAddFamiliesModal
        v-model:open="addOpen"
        :session-id="sessionId"
        :free="slots.free"
        :invites="open"
        :initial-kind="addKind"
        @added="changed"
      />
      <SessionsAnswerModal
        v-model:open="answerOpen"
        :title="answering ? `La risposta di ${answering.familyName}` : 'La risposta'"
        description="Per una risposta arrivata per telefono o di persona. Non parte nessuna email."
        :answers="answerOptions"
        submit-label="Registra la risposta"
        :loading="busy"
        reason-help="Lo legge solo l’amministrazione."
        @submit="saveAnswer"
      />
    </template>
  </div>
</template>
