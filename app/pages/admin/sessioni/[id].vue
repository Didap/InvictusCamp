<script setup lang="ts">
import type { ButtonProps, DropdownMenuItem } from '@nuxt/ui'
import type { SessionInput } from '#shared/schemas/sessions'
import type { SessionCreated, SessionDetail, SessionMove, SessionTransitionResult } from '#shared/types/sessions'
import { DEFAULT_LOCATION, enumMeta, type SessionStatus } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDateTime, formatDay, formatDayRange, plural } from '#shared/utils/format'
import { SESSION_TRANSITION_ACTIONS, isSessionEditable } from '#shared/utils/session-status'

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
  { value: 'alloggi', label: 'Alloggi', icon: 'i-lucide-bed-double', slot: 'alloggi' as const },
  { value: 'gruppi', label: 'Gruppi', icon: 'i-lucide-shapes', slot: 'gruppi' as const },
  { value: 'staff', label: 'Staff', icon: 'i-lucide-id-card', slot: 'staff' as const },
  { value: 'programma', label: 'Programma', icon: 'i-lucide-calendar-clock', slot: 'programma' as const },
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
  'session.cancelled': n =>
    n === 1 ? '1 avviso di annullamento a una famiglia' : `${n} avvisi di annullamento alle famiglie`,
  'staff.convocation_cancelled': n => (n === 1 ? '1 avviso a una persona dello staff' : `${n} avvisi allo staff`),
}

function emailsSentence(move: SessionMove): string {
  if (!move.emails) return 'Non partirà nessuna email.'
  const parts = Object.entries(move.emailsByTemplate).map(([template, count]) =>
    (EMAIL_KINDS[template] ?? (n => plural(n, 'email', 'email')))(count),
  )
  return `${move.emails === 1 ? 'Partirà 1 email' : `Partiranno ${move.emails} email`}: ${parts.join(' e ')}.`
}

/** What the confirmation of a move says, from what the page already knows (spec 3.2: nothing silent). */
function moveNotes(move: SessionMove, s: SessionDetail): string[] {
  const notes = [move.effect]
  if (move.to === 'confirmed') {
    const waiting = s.slots.held - s.slots.confirmed
    const { free, reserves } = s.slots
    notes.push(
      waiting === 0
        ? 'Tutte le famiglie titolari hanno risposto.'
        : waiting === 1
          ? '1 famiglia titolare non ha ancora risposto: potrà farlo anche dopo.'
          : `${waiting} famiglie titolari non hanno ancora risposto: potranno farlo anche dopo.`,
      free
        ? `${free === 1 ? 'Resta 1 posto libero' : `Restano ${free} posti liberi`}${reserves ? ` e ${plural(reserves, 'riserva', 'riserve')} in attesa` : ''}.`
        : 'Non restano posti liberi.',
    )
  }
  if (move.to === 'cancelled') {
    const convocations = s.staff.open
    if (convocations) {
      notes.push(
        convocations === 1
          ? 'Anche la convocazione dello staff viene annullata.'
          : `Anche le ${convocations} convocazioni dello staff vengono annullate.`,
      )
    }
  }
  // "Segna come conclusa" already says it sends nothing.
  if (move.emails || move.to !== 'completed') notes.push(emailsSentence(move))
  if (move.to === 'inviting' && !s.responseDeadline) {
    notes.push('Non hai indicato entro quando rispondere: puoi aggiungerlo prima, con «Modifica».')
  }
  if (move.to === 'completed' || move.to === 'cancelled') notes.push('Non si può tornare indietro.')
  return notes
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
  const ok = await confirm({
    title: `${move.label}?`,
    description: moveNotes(move, current).join(' '),
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

// ─── The next step ─────────────────────────────────────────────────────────────────────────────────

/** The Famiglie tab, mounted only while open: a step can bring the focus to one of its buttons. */
const familiesTab = ref<HTMLElement | null>(null)

/**
 * Opens the Famiglie tab and, once its list has loaded, puts the focus on the button with these words
 * (or on the tab itself), so that the step is one key away.
 */
async function openFamilies(action?: 'add-families' | 'call-reserve') {
  tab.value = 'famiglie'
  // The tab opens with the route, its list loads after: wait for them, about three seconds at most.
  for (let frame = 0; frame < 180; frame++) {
    await new Promise(resolve => requestAnimationFrame(resolve))
    if (tab.value !== 'famiglie') return
    if (!familiesTab.value) continue
    if (!action) break
    // FamiliesPanel marks its two main buttons with data-action.
    const target = familiesTab.value.querySelector<HTMLElement>(`[data-action="${action}"]`)
    if (target) {
      target.focus()
      target.scrollIntoView({ block: 'nearest' })
      return
    }
  }
  document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
}

const toFamilies = (action?: 'add-families' | 'call-reserve'): ButtonProps => ({
  label: 'Vai alla scheda Famiglie',
  trailingIcon: 'i-lucide-arrow-right',
  onClick: () => openFamilies(action),
})

const doMove = (to: SessionStatus): ButtonProps => ({
  label: SESSION_TRANSITION_ACTIONS[to],
  icon: enumMeta('sessionStatus', to).icon,
  loading: moving.value === to,
  onClick: () => applyMove(to),
})

/** What to do now, with the button that does it or opens the place where it is done. */
const nextStep = computed<{ text: string; action: ButtonProps } | null>(() => {
  const s = session.value
  if (!s) return null
  if (s.status === 'draft') {
    return s.slots.held
      ? {
          text: 'Quando le famiglie titolari e le riserve sono quelle giuste, apri gli inviti: solo allora ricevono l’email.',
          action: doMove('inviting'),
        }
      : {
          text: 'Aggiungi le famiglie titolari e le riserve dalla scheda Famiglie, poi apri gli inviti.',
          action: toFamilies('add-families'),
        }
  }
  if (s.status !== 'inviting' && s.status !== 'confirmed') return null
  if (s.slots.free > 0 && s.slots.reserves > 0) {
    return {
      text: `${s.slots.free === 1 ? 'C’è 1 posto libero' : `Ci sono ${s.slots.free} posti liberi`} e ${plural(s.slots.reserves, 'riserva', 'riserve')} in attesa: puoi chiamare la riserva dalla scheda Famiglie.`,
      action: toFamilies('call-reserve'),
    }
  }
  const waiting = s.slots.held - s.slots.confirmed
  if (s.status === 'inviting' && waiting > 0) {
    return {
      text: `${waiting === 1 ? '1 famiglia titolare non ha' : `${waiting} famiglie titolari non hanno`} ancora risposto${s.responseDeadline ? `: il termine è il ${formatDay(s.responseDeadline, 'long')}` : ''}.`,
      action: toFamilies(),
    }
  }
  if (s.status === 'inviting' && s.slots.confirmed > 0) {
    return {
      text: 'Tutte le famiglie titolari hanno risposto: quando sei pronto, conferma la sessione.',
      action: doMove('confirmed'),
    }
  }
  if (s.status === 'confirmed' && s.endDate < todayIso()) {
    return { text: 'La sessione è finita: segnala come conclusa.', action: doMove('completed') }
  }
  return null
})

// ─── Numbers ───────────────────────────────────────────────────────────────────────────────────────

/** Under "3/6" confirmed: the places held, and the free ones while the session is open. */
const placesHint = computed(() => {
  const slots = session.value?.slots
  if (!slots) return undefined
  const held = plural(slots.held, 'posto occupato', 'posti occupati')
  if (!editable.value) return held
  return `${held} · ${slots.free ? plural(slots.free, 'libero', 'liberi') : 'nessuno libero'}`
})

/** Staff in words: who is on the way, convocations "da inviare", people "da trovare" (no one convoked yet). */
const staffHint = computed(() => {
  const staff = session.value?.staff
  if (!staff || !editable.value) return undefined
  const pending = staff.accepted - staff.confirmed + staff.waiting
  const missing = Math.max(0, staff.needed - staff.accepted - staff.waiting - staff.toSend)
  const parts = [
    pending && `${pending} in attesa di risposta o firma`,
    staff.drafts && `${staff.drafts} da inviare`,
    missing && `${missing} da trovare`,
  ].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return staff.needed ? 'Al completo' : 'Nessuna persona richiesta'
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
          <!-- Outlined: the one solid button of each tab is the tab's own action. -->
          <UButton
            v-for="move in forwardMoves"
            :key="move.to"
            :label="move.label"
            :icon="enumMeta('sessionStatus', move.to).icon"
            variant="outline"
            :loading="moving === move.to"
            :disabled="moving !== null"
            @click="applyMove(move.to)"
          />
          <UButton
            v-if="cancelMove"
            :label="cancelMove.label"
            icon="i-lucide-circle-x"
            color="error"
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
            :description="nextStep.text"
            :actions="[{ size: 'md', disabled: moving !== null, ...nextStep.action }]"
            class="mb-8"
          />

          <div class="mb-10 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <IcStatCard
              label="Famiglie confermate"
              :value="`${session.slots.confirmed}/${session.slots.total}`"
              :hint="placesHint"
              icon="i-lucide-circle-check"
              :to="tabLink('famiglie')"
            />
            <IcStatCard
              v-if="editable"
              :label="session.status === 'draft' ? 'Famiglie da invitare' : 'In attesa di risposta'"
              :value="session.slots.held - session.slots.confirmed"
              :hint="
                session.status === 'draft'
                  ? 'Ricevono l’invito quando apri gli inviti'
                  : session.responseDeadline
                    ? `Risposte entro il ${formatDay(session.responseDeadline)}`
                    : 'Famiglie titolari invitate'
              "
              icon="i-lucide-hourglass"
              :to="tabLink('famiglie')"
            />
            <IcStatCard
              label="Riserve in attesa"
              :value="session.slots.reserves"
              :hint="editable ? 'Le chiami tu quando si libera un posto' : undefined"
              icon="i-lucide-list-ordered"
              :to="tabLink('famiglie')"
            />
            <IcStatCard
              label="Staff confermato"
              :value="`${session.staff.confirmed}/${session.staff.needed}`"
              :hint="staffHint"
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
          <div ref="familiesTab">
            <SessionsFamiliesPanel :session-id="session.id" @changed="refresh" />
          </div>
        </template>
        <template #alloggi>
          <LodgingsSessionPanel :session-id="session.id" />
        </template>
        <template #gruppi>
          <GroupsSessionPanel :session-id="session.id" />
        </template>
        <template #staff>
          <StaffSessionStaffPanel :session-id="session.id" />
        </template>
        <template #programma>
          <ProgrammeSessionPanel :session-id="session.id" />
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
