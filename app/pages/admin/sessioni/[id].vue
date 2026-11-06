<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { SessionInput } from '#shared/schemas/sessions'
import type { SessionCreated, SessionDetail, SessionMove, SessionTransitionResult } from '#shared/types/sessions'
import { DEFAULT_LOCATION, enumMeta, type SessionStatus } from '#shared/utils/constants'
import { formatDateTime, formatDay, formatDayRange, plural } from '#shared/utils/format'
import { isSessionEditable } from '#shared/utils/session-status'

// One session (docs/spec.md 3.2): the status with its valid moves, then the tabs. Every move first
// says what it does and how many emails leave. The tab lives in the query string (?tab=famiglie).
// A new session id is a new page: local state (edit form, families panel) starts again.
definePageMeta({ key: route => String(route.params.id) })

const route = useRoute()
const api = useApi()
const confirm = useConfirm()
const sessionId = computed(() => String(route.params.id))

const {
  data: session,
  error,
  refresh,
} = await useApiFetch<SessionDetail>(() => `/api/admin/sessions/${sessionId.value}`)

const TABS = [
  { value: 'panoramica', label: 'Panoramica', icon: 'i-lucide-layout-dashboard', slot: 'panoramica' as const },
  { value: 'famiglie', label: 'Famiglie', icon: 'i-lucide-heart-handshake', slot: 'famiglie' as const },
  { value: 'staff', label: 'Staff', icon: 'i-lucide-id-card', slot: 'staff' as const },
  { value: 'documenti', label: 'Documenti', icon: 'i-lucide-files', slot: 'documenti' as const },
  { value: 'comunicazioni', label: 'Comunicazioni', icon: 'i-lucide-mail', slot: 'comunicazioni' as const },
]
const tab = computed<string>({
  get: () => {
    const value = route.query.tab
    return typeof value === 'string' && TABS.some(item => item.value === value) ? value : 'panoramica'
  },
  set: value => {
    navigateTo({ query: { ...route.query, tab: value === 'panoramica' ? undefined : value } }, { replace: true })
  },
})
const tabLink = (value: string) => `/admin/sessioni/${sessionId.value}?tab=${value}`

const editable = computed(() => !!session.value && isSessionEditable(session.value.status))
const forwardMoves = computed(() => session.value?.moves.filter(move => move.to !== 'cancelled') ?? [])
const cancelMove = computed(() => session.value?.moves.find(move => move.to === 'cancelled'))

// ─── Status moves ──────────────────────────────────────────────────────────────────────────────────

const EMAIL_KINDS: Record<string, (count: number) => string> = {
  'session.invite': n => (n === 1 ? '1 invito a una famiglia titolare' : `${n} inviti alle famiglie titolari`),
  'session.reserve': n => (n === 1 ? '1 avviso a una riserva' : `${n} avvisi alle riserve`),
  'session.confirmed': n => (n === 1 ? '1 conferma' : `${n} conferme`),
  'session.cancelled': n => (n === 1 ? '1 avviso di annullamento' : `${n} avvisi di annullamento`),
}

function emailsSentence(move: SessionMove): string {
  if (!move.emails) return 'Non partirà nessuna email.'
  const parts = Object.entries(move.emailsByTemplate).map(([template, count]) =>
    (EMAIL_KINDS[template] ?? (n => plural(n, 'email', 'email')))(count),
  )
  return `${move.emails === 1 ? 'Partirà 1 email' : `Partiranno ${move.emails} email`}: ${parts.join(' e ')}.`
}

const SUCCESS: Record<SessionStatus, string> = {
  draft: 'Sessione in bozza',
  inviting: 'Inviti aperti',
  confirmed: 'Sessione confermata',
  completed: 'Sessione conclusa',
  cancelled: 'Sessione annullata',
}

const moving = ref<SessionStatus | null>(null)
const toast = useToast()

async function applyMove(to: SessionStatus) {
  // Counts can change while the page is open: read them again before saying how many emails leave.
  await refresh()
  const current = session.value
  const move = current?.moves.find(item => item.to === to)
  if (!current || !move) {
    toast.add({
      title: 'La sessione è cambiata nel frattempo',
      description: 'Controlla il suo stato e riprova.',
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    })
    return
  }
  const notes = [move.effect, emailsSentence(move)]
  if (to === 'inviting' && !current.responseDeadline) {
    notes.push('Non hai indicato entro quando rispondere: puoi aggiungerlo prima, con «Modifica».')
  }
  const ok = await confirm({
    title: `${move.label}?`,
    description: notes.join(' '),
    confirmLabel: move.label,
    cancelLabel: 'Torna indietro',
    danger: to === 'cancelled',
  })
  if (!ok) return
  moving.value = to
  try {
    const result = await api<SessionTransitionResult>(`/api/admin/sessions/${current.id}/status`, {
      method: 'POST',
      body: { to },
    })
    notifySuccess(
      SUCCESS[result.to],
      result.emails ? `${plural(result.emails, 'email inviata', 'email inviate')}.` : 'Nessuna email inviata.',
    )
    await Promise.all([refresh(), refreshNuxtData(`session-families-${current.id}`)])
  } catch (error) {
    notifyError(error, 'Stato non cambiato')
  } finally {
    moving.value = null
  }
}

// ─── Other actions (P1: duplicate, CSV, delete) ────────────────────────────────────────────────────

async function duplicate() {
  if (!session.value) return
  try {
    const { id } = await api<SessionCreated>(`/api/admin/sessions/${session.value.id}/duplicate`, { method: 'POST' })
    notifySuccess('Sessione duplicata', 'La copia è in bozza, senza famiglie né staff: controlla le date.')
    await navigateTo(`/admin/sessioni/${id}`)
  } catch (error) {
    notifyError(error, 'Sessione non duplicata')
  }
}

async function remove() {
  if (!session.value) return
  const ok = await confirm({
    title: 'Elimini la sessione?',
    description: `«${session.value.title}» non ha famiglie né staff: sparisce dall’elenco. Non partirà nessuna email.`,
    confirmLabel: 'Elimina',
    cancelLabel: 'Torna indietro',
    danger: true,
  })
  if (!ok) return
  try {
    const url: string = `/api/admin/sessions/${session.value.id}`
    await api<{ ok: boolean }>(url, { method: 'DELETE' })
    notifySuccess('Sessione eliminata')
    await navigateTo('/admin/sessioni', { replace: true })
  } catch (error) {
    notifyError(error, 'Sessione non eliminata')
  }
}

const moreItems = computed<DropdownMenuItem[][]>(() => {
  if (!session.value) return []
  const groups: DropdownMenuItem[][] = [
    [
      { label: 'Duplica', icon: 'i-lucide-copy', onSelect: duplicate },
      {
        label: 'Scarica le famiglie (CSV)',
        icon: 'i-lucide-download',
        to: `/api/admin/sessions/${session.value.id}/export`,
        external: true,
        download: true,
      },
    ],
  ]
  if (session.value.deletable) {
    groups.push([{ label: 'Elimina la sessione', icon: 'i-lucide-trash-2', color: 'error', onSelect: remove }])
  }
  return groups
})

// ─── Details and edit ──────────────────────────────────────────────────────────────────────────────

const editing = ref(false)
const saving = ref(false)

const details = computed(() => {
  const s = session.value
  if (!s) return []
  return [
    { label: 'Date', value: formatDayRange(s.startDate, s.endDate, 'long') },
    { label: 'Luogo', value: s.location },
    { label: 'Posti per le famiglie', value: s.familySlots },
    { label: 'Persone di staff necessarie', value: s.staffNeeded },
    { label: 'Rispondere entro', value: formatDay(s.responseDeadline, 'long') },
    { label: 'Contratto per lo staff', value: s.contractDocument?.title ?? 'Nessun contratto' },
    { label: 'Descrizione', value: s.description },
    { label: 'Note interne', value: s.notes },
  ]
})

const formInitial = computed<Partial<SessionInput>>(() => {
  const s = session.value
  if (!s) return {}
  return {
    title: s.title,
    description: s.description,
    location: s.location,
    startDate: s.startDate,
    endDate: s.endDate,
    familySlots: s.familySlots,
    staffNeeded: s.staffNeeded,
    responseDeadline: s.responseDeadline,
    contractDocumentId: s.contractDocument?.id ?? null,
    notes: s.notes,
  }
})

async function save(values: SessionInput) {
  if (!session.value) return
  saving.value = true
  try {
    session.value = await api<SessionDetail>(`/api/admin/sessions/${session.value.id}`, {
      method: 'PATCH',
      body: values,
    })
    editing.value = false
    notifySuccess('Sessione aggiornata')
  } catch (error) {
    notifyError(error, 'Modifiche non salvate')
  } finally {
    saving.value = false
  }
}

const nextStep = computed(() => {
  const s = session.value
  if (!s) return null
  if (s.status === 'draft') {
    return s.slots.held
      ? 'Quando le famiglie titolari e le riserve sono quelle giuste, apri gli inviti: solo allora ricevono l’email.'
      : 'Aggiungi le famiglie titolari e le riserve dalla scheda Famiglie, poi apri gli inviti.'
  }
  if (s.status === 'inviting' || s.status === 'confirmed') {
    if (s.slots.free > 0 && s.slots.reserves > 0) {
      return `${s.slots.free === 1 ? 'C’è 1 posto libero' : `Ci sono ${s.slots.free} posti liberi`} e ${plural(s.slots.reserves, 'riserva', 'riserve')} in attesa: puoi chiamare la riserva dalla scheda Famiglie.`
    }
    const waiting = s.slots.held - s.slots.confirmed
    if (s.status === 'inviting' && waiting > 0) {
      return `${waiting === 1 ? '1 famiglia titolare non ha' : `${waiting} famiglie titolari non hanno`} ancora risposto${s.responseDeadline ? `: il termine è il ${formatDay(s.responseDeadline, 'long')}` : ''}.`
    }
  }
  return null
})
</script>

<template>
  <IcPage :title="session?.title ?? 'Sessione'" back="/admin/sessioni" width="wide">
    <UEmpty
      v-if="error || !session"
      icon="i-lucide-calendar-x"
      title="Sessione non trovata"
      :description="error ? apiErrorMessage(error, 'Non riesco a caricare la sessione') : undefined"
      :actions="[{ label: 'Torna alle sessioni', icon: 'i-lucide-arrow-left', to: '/admin/sessioni' }]"
    />

    <template v-else>
      <div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0 space-y-2">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <IcStatusBadge kind="sessionStatus" :value="session.status" size="lg" />
            <span class="text-sm text-muted">{{ enumMeta('sessionStatus', session.status).description }}</span>
          </div>
          <p class="font-semibold text-highlighted">
            {{ formatDayRange(session.startDate, session.endDate, 'long') }}
            <span v-if="session.location !== DEFAULT_LOCATION" class="font-normal text-muted">
              · {{ session.location }}
            </span>
          </p>
          <p v-if="session.statusChangedAt" class="text-sm text-muted">
            Stato cambiato il {{ formatDateTime(session.statusChangedAt) }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2 lg:shrink-0">
          <UButton
            v-for="move in forwardMoves"
            :key="move.to"
            :label="move.label"
            :icon="enumMeta('sessionStatus', move.to).icon"
            :loading="moving === move.to"
            :disabled="moving !== null"
            @click="applyMove(move.to)"
          />
          <UButton
            v-if="cancelMove"
            :label="cancelMove.label"
            icon="i-lucide-circle-x"
            color="neutral"
            variant="outline"
            :loading="moving === 'cancelled'"
            :disabled="moving !== null"
            @click="applyMove('cancelled')"
          />
          <UDropdownMenu :items="moreItems" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" label="Altro" />
          </UDropdownMenu>
        </div>
      </div>

      <UTabs
        v-model="tab"
        :items="TABS"
        variant="link"
        :unmount-on-hide="true"
        :ui="{ root: 'gap-8', list: 'overflow-x-auto overflow-y-hidden', trigger: 'shrink-0' }"
      >
        <template #panoramica>
          <UAlert
            v-if="nextStep"
            color="info"
            variant="subtle"
            icon="i-lucide-lightbulb"
            title="Il prossimo passo"
            :description="nextStep"
            class="mb-8"
          />

          <div class="mb-10 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <IcStatCard
              label="Posti occupati"
              :value="`${session.slots.held}/${session.slots.total}`"
              :hint="
                session.slots.free ? plural(session.slots.free, 'posto libero', 'posti liberi') : 'Nessun posto libero'
              "
              icon="i-lucide-user-check"
              :to="tabLink('famiglie')"
            />
            <IcStatCard
              label="Famiglie confermate"
              :value="session.slots.confirmed"
              :hint="`Su ${plural(session.slots.total, 'posto', 'posti')}`"
              icon="i-lucide-circle-check"
              :to="tabLink('famiglie')"
            />
            <IcStatCard
              label="Riserve in attesa"
              :value="session.slots.reserves"
              hint="Le chiami tu quando si libera un posto"
              icon="i-lucide-list-ordered"
              :to="tabLink('famiglie')"
            />
            <IcStatCard
              label="Staff confermato"
              :value="`${session.staff.confirmed}/${session.staff.needed}`"
              :hint="`${session.staff.accepted} ${session.staff.accepted === 1 ? 'ha' : 'hanno'} accettato · ${session.staff.waiting} in attesa · ${session.staff.toSend} da convocare`"
              icon="i-lucide-id-card"
              :to="tabLink('staff')"
            />
          </div>

          <IcSection title="Dettagli">
            <template v-if="editable && !editing" #actions>
              <UButton
                icon="i-lucide-pencil"
                label="Modifica"
                color="neutral"
                variant="outline"
                @click="editing = true"
              />
            </template>
            <SessionsForm
              v-if="editing"
              :initial="formInitial"
              submit-label="Salva le modifiche"
              :loading="saving"
              :min-slots="session.slots.held"
              :invitations-sent="session.status !== 'draft'"
              cancellable
              @submit="save"
              @cancel="editing = false"
            />
            <template v-else>
              <IcDataList :items="details" :columns="2" />
              <p class="mt-6 text-sm text-muted">
                Creata il {{ formatDateTime(session.createdAt) }}.
                <template v-if="!editable">Una sessione conclusa o annullata non si modifica più.</template>
              </p>
            </template>
          </IcSection>
        </template>

        <template #famiglie>
          <SessionsFamiliesPanel :session-id="session.id" @changed="refresh" />
        </template>
        <template #staff>
          <StaffSessionStaffPanel :session-id="session.id" />
        </template>
        <template #documenti>
          <DocumentsSessionDocumentsPanel :session-id="session.id" />
        </template>
        <template #comunicazioni>
          <CommunicationsSessionCommunicationsPanel :session-id="session.id" />
        </template>
      </UTabs>
    </template>
  </IcPage>
</template>
