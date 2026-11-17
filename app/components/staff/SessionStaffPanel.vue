<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { SessionConvocation, SessionStaffData } from '#shared/types/staff'
import { staffSlot } from '#shared/schemas/staff'
import { OF_TEAM, OPEN_CONVOCATIONS, STAFF_TEAMS, type StaffTeam } from '#shared/utils/constants'
import { formatDateTime, fullName, plural } from '#shared/utils/format'
import { teamPath } from '#shared/utils/routes'

// CONTRACT (docs/BUILD.md): owned by A2 Staff. Admin session page, tab "Staff e v-team": two lists, the
// convocations of the staff and those of the v-team, with their status and the derived "Confermata"
// (accepted and contract signed), the coordinator of each team, the people of the team to add among those
// available for the session; "Invia la convocazione" (one or the selected ones of both lists, optional
// message), cancel (spec 3.5). Props are final.
const props = defineProps<{ sessionId: string }>()

const api = useApi()
const confirm = useConfirm()
const { label } = useEnums()
const { roleItems, roleName, roleList } = useStaffLabels()
const { data, status, refresh } = useApiFetch<SessionStaffData>('/api/admin/convocations', {
  query: computed(() => ({ sessionId: props.sessionId })),
})

const session = computed(() => data.value?.session)
const convocations = computed(() => data.value?.convocations ?? [])
const counts = computed(() => data.value?.counts)
const editable = computed(() => session.value?.editable ?? false)
const drafts = computed(() => convocations.value.filter(c => c.status === 'draft' && c.sendable))

/** Drafts ticked for sending; empty means "all the drafts". */
const selected = ref<string[]>([])
watch(drafts, list => {
  selected.value = selected.value.filter(id => list.some(c => c.id === id))
})
const toSend = computed(() =>
  selected.value.length ? drafts.value.filter(c => selected.value.includes(c.id)) : drafts.value,
)
function toggleSelected(id: string, value: boolean) {
  selected.value = value ? [...new Set([...selected.value, id])] : selected.value.filter(other => other !== id)
}

// Each team is a list of its own; selecting and sending work across both.
const teams = computed(() =>
  STAFF_TEAMS.map(team => {
    const list = convocations.value.filter(c => c.team === team)
    const draftIds = list.filter(c => c.status === 'draft' && c.sendable).map(c => c.id)
    const ticked = draftIds.filter(id => selected.value.includes(id)).length
    const allSelected: boolean | 'indeterminate' = !ticked ? false : ticked === draftIds.length ? true : 'indeterminate'
    return { team, list, draftIds, allSelected }
  }),
)
function selectAll(ids: string[], value: boolean) {
  selected.value = value ? [...new Set([...selected.value, ...ids])] : selected.value.filter(id => !ids.includes(id))
}

const addOpen = ref(false)
const addTeam = ref<StaffTeam>('staff')
function openAdd(team: StaffTeam) {
  addTeam.value = team
  addOpen.value = true
}
const sendOpen = ref(false)
const sendList = ref<SessionConvocation[]>([])
function openSend(list: SessionConvocation[]) {
  sendList.value = list
  sendOpen.value = true
}
async function afterChange() {
  selected.value = []
  await refresh()
}

/** The roles of the application. */
const describe = (c: SessionConvocation) => roleList(c.staffRoles, 'Ruoli non indicati')
const roleEditable = (c: SessionConvocation) => editable.value && OPEN_CONVOCATIONS.includes(c.status)

async function changeRole(c: SessionConvocation, role: string) {
  if (role === c.role) return
  try {
    await api(`/api/admin/convocations/${c.id}`, { method: 'PATCH', body: { role } })
    notifySuccess('Ruolo aggiornato', fullName(c))
  } catch (error) {
    notifyError(error)
  }
  await refresh()
}

async function cancel(c: SessionConvocation) {
  const name = fullName(c)
  const draft = c.status === 'draft'
  const ok = await confirm(
    draft
      ? {
          title: `Togli ${name} dalla sessione?`,
          description: 'La convocazione non era ancora stata inviata: nessuna email parte.',
          confirmLabel: 'Togli dalla sessione',
          danger: true,
        }
      : {
          title: `Annulli la convocazione di ${name}?`,
          description: `${
            c.sendable ? `Partirà 1 email a ${name} con l’avviso.` : 'Nessuna email parte: l’account è disattivato.'
          }${
            c.status === 'accepted' && c.contract === 'pending'
              ? ' Anche la richiesta di firma del contratto viene annullata, se non serve per un’altra sessione.'
              : ''
          }`,
          confirmLabel: 'Annulla la convocazione',
          cancelLabel: 'Non annullare',
          danger: true,
        },
  )
  if (!ok) return
  try {
    const url: string = `/api/admin/convocations/${c.id}/cancel`
    const result = await api<{ emails: number; failed: number }>(url, { method: 'POST' })
    notifySuccess(
      draft ? 'Convocazione tolta' : 'Convocazione annullata',
      result.failed
        ? 'L’email di avviso non è stata recapitata: controlla il registro delle email.'
        : result.emails
          ? `Email inviata a ${name}.`
          : undefined,
    )
  } catch (error) {
    notifyError(error)
  }
  await afterChange()
}

function rowActions(c: SessionConvocation): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = [
    [{ label: 'Apri la scheda', icon: 'i-lucide-id-card', to: teamPath(c.team, c.userId) }],
  ]
  if (!editable.value) return groups
  const actions: DropdownMenuItem[] = []
  if (c.status === 'draft' && c.sendable) {
    actions.push({ label: 'Invia la convocazione', icon: 'i-lucide-send', onSelect: () => openSend([c]) })
  }
  if (c.status === 'draft') {
    actions.push({ label: 'Togli dalla sessione', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => cancel(c) })
  }
  if (c.status === 'sent' || c.status === 'accepted') {
    actions.push({ label: 'Annulla la convocazione', icon: 'i-lucide-ban', color: 'error', onSelect: () => cancel(c) })
  }
  if (actions.length) groups.push(actions)
  return groups
}

function statusNote(c: SessionConvocation): string {
  switch (c.status) {
    case 'draft':
      return c.sendable ? 'Non ancora inviata' : 'Non è più nello staff approvato: non si può inviare'
    case 'sent':
      return `Inviata il ${formatDateTime(c.sentAt)}`
    case 'accepted':
      return `Accettata il ${formatDateTime(c.respondedAt)}`
    case 'declined':
      return `Rifiutata il ${formatDateTime(c.respondedAt)}`
    default:
      return ''
  }
}

// The base of a session (spec 3.5): `staffNeeded` people of the staff, plus a coordinator for the staff
// and one for the v-team. Counted on the convocations still open (draft, sent, accepted).
const confirmedAs = (slot: StaffTeam) => convocations.value.filter(c => c.confirmed && staffSlot(c) === slot).length
const staffConfirmed = computed(() => confirmedAs('staff'))
function coordinatorsOf(team: StaffTeam): string[] {
  return convocations.value
    .filter(c => c.team === team && staffSlot(c) === 'coordinator' && OPEN_CONVOCATIONS.includes(c.status))
    .map(c => (c.confirmed ? fullName(c) : `${fullName(c)} (non ancora confermato)`))
}
/** Under the title of a list: the staff against `staffNeeded` (coordinator aside), the v-team as it is. */
function teamDescription(team: StaffTeam): string {
  if (team === 'volunteer') return plural(confirmedAs('volunteer'), 'confermato', 'confermati')
  const needed = session.value?.staffNeeded ?? 0
  return `${plural(staffConfirmed.value, 'confermato', 'confermati')} su ${plural(needed, 'necessario', 'necessari')}, coordinatore a parte`
}

const sendLabel = computed(() => {
  if (selected.value.length) {
    return selected.value.length === 1
      ? 'Invia la convocazione selezionata'
      : `Invia le ${selected.value.length} selezionate`
  }
  return drafts.value.length === 1 ? 'Invia la convocazione' : `Invia le ${drafts.value.length} convocazioni`
})

function summaryOf(team: StaffTeam): string {
  const c = counts.value?.[team]
  if (!c) return ''
  const parts = [
    c.accepted && `${c.accepted} ${c.accepted === 1 ? 'accettata' : 'accettate'}`,
    c.waiting && `${c.waiting} in attesa di risposta`,
    c.draft && `${c.draft} da inviare`,
    c.declined && `${c.declined} ${c.declined === 1 ? 'rifiutata' : 'rifiutate'}`,
  ].filter(Boolean)
  return parts.join(' · ')
}

const columns = (draftIds: string[]): TableColumn<SessionConvocation>[] => [
  ...(editable.value && draftIds.length ? [{ id: 'select' }] : []),
  { id: 'person', header: 'Persona' },
  { id: 'role', header: 'Ruolo nella sessione' },
  { id: 'available', header: 'Disponibilità' },
  { id: 'status', header: 'Stato' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Azioni') },
]
</script>

<template>
  <div>
    <div v-if="!data && status === 'pending'" class="space-y-3" aria-busy="true">
      <USkeleton class="h-6 w-64" />
      <USkeleton class="h-32 w-full" />
    </div>

    <UAlert
      v-else-if="!data"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare lo staff e il v-team della sessione"
      description="Controlla la connessione e riprova."
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else-if="session">
      <div class="space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <p class="flex max-w-prose items-start gap-2 text-sm text-muted">
            <UIcon name="i-lucide-signature" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span v-if="session.contract">
              Contratto della sessione: «{{ session.contract.title }}». Chi accetta la convocazione riceve la richiesta
              di firma; la convocazione è confermata quando il contratto è firmato.
            </span>
            <span v-else>
              Questa sessione non ha un contratto: la convocazione è confermata quando viene accettata.
            </span>
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              class="pointer-coarse:min-h-11"
              :to="`/admin/comunicazioni/nuova?audience=session_staff&sessionId=${sessionId}`"
              icon="i-lucide-mail"
              label="Scrivi ai convocati"
              color="neutral"
              variant="ghost"
            />
            <UButton
              class="pointer-coarse:min-h-11"
              v-if="editable && drafts.length"
              icon="i-lucide-send"
              :label="sendLabel"
              @click="openSend(toSend)"
            />
          </div>
        </div>
        <UAlert
          v-if="!editable"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          title="La sessione è conclusa o annullata"
          description="Le convocazioni restano qui per lo storico e non si possono più cambiare."
        />
      </div>

      <IcSection
        v-for="{ team, list, draftIds, allSelected } in teams"
        :key="team"
        :title="label('staffTeam', team)"
        :description="teamDescription(team)"
      >
        <template v-if="editable" #actions>
          <UButton
            class="pointer-coarse:min-h-11"
            icon="i-lucide-user-plus"
            :label="`Aggiungi persone ${OF_TEAM[team]}`"
            color="neutral"
            variant="outline"
            @click="openAdd(team)"
          />
        </template>

        <div class="mb-5 space-y-3">
          <UProgress
            v-if="team === 'staff' && session.staffNeeded > 0"
            :model-value="Math.min(staffConfirmed, session.staffNeeded)"
            :max="session.staffNeeded"
            size="sm"
            :aria-label="`Staff confermato: ${staffConfirmed} su ${session.staffNeeded}`"
            class="max-w-md"
          />
          <p class="flex items-start gap-2 text-sm">
            <UIcon name="i-lucide-flag" class="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
            <span>
              <span class="text-muted">Coordinatore:</span>{{ ' ' }}
              <span v-if="coordinatorsOf(team).length">{{ coordinatorsOf(team).join(', ') }}</span>
              <span v-else class="text-warning">da scegliere</span>
            </span>
          </p>
          <p v-if="summaryOf(team)" class="text-sm text-muted">{{ summaryOf(team) }}</p>
        </div>

        <UEmpty
          v-if="!list.length"
          icon="i-lucide-users"
          :title="`Nessuna persona ${OF_TEAM[team]} convocata`"
          :description="
            editable
              ? 'Aggiungi chi ha detto che c’è per questa sessione. Le convocazioni partono solo quando le invii.'
              : 'Nessuno è stato convocato per questa sessione.'
          "
        />

        <template v-else>
          <UTable :data="list" :columns="columns(draftIds)" :get-row-id="row => row.id" class="hidden md:block">
            <template #select-header>
              <UCheckbox
                :model-value="allSelected"
                :aria-label="`Seleziona tutte le convocazioni ${OF_TEAM[team]} da inviare`"
                @update:model-value="value => selectAll(draftIds, value === true)"
              />
            </template>
            <template #select-cell="{ row }">
              <UCheckbox
                v-if="row.original.status === 'draft' && row.original.sendable"
                :model-value="selected.includes(row.original.id)"
                :aria-label="`Seleziona ${fullName(row.original)}`"
                @update:model-value="value => toggleSelected(row.original.id, value === true)"
              />
            </template>
            <template #person-cell="{ row }">
              <ULink :to="teamPath(team, row.original.userId)" class="font-semibold text-primary hover:underline">
                {{ fullName(row.original) }}
              </ULink>
              <p class="text-sm text-muted">{{ describe(row.original) }}</p>
            </template>
            <template #role-cell="{ row }">
              <USelect
                v-if="roleEditable(row.original)"
                :model-value="row.original.role ?? undefined"
                :items="roleItems"
                placeholder="Scegli il ruolo"
                size="sm"
                class="w-44"
                :aria-label="`Ruolo di ${fullName(row.original)} nella sessione`"
                @update:model-value="value => changeRole(row.original, value as string)"
              />
              <span v-else>{{ roleName(row.original.role) ?? 'Non indicato' }}</span>
            </template>
            <template #available-cell="{ row }">
              <IcStatusBadge kind="staffAvailability" :value="row.original.available ? 'available' : 'missing'" />
            </template>
            <template #status-cell="{ row }">
              <div class="flex flex-wrap gap-1.5">
                <StaffConvocationBadge :status="row.original.status" :confirmed="row.original.confirmed" />
                <StaffContractBadge
                  v-if="row.original.status === 'accepted' && !row.original.confirmed"
                  :state="row.original.contract"
                />
              </div>
              <p v-if="statusNote(row.original)" class="mt-1 text-sm text-muted">{{ statusNote(row.original) }}</p>
              <p v-if="row.original.declineReason" class="mt-1 max-w-xs text-sm whitespace-normal text-muted">
                «{{ row.original.declineReason }}»
              </p>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end">
                <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
                  <UButton
                    class="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    icon="i-lucide-ellipsis-vertical"
                    color="neutral"
                    variant="ghost"
                    :aria-label="`Azioni per ${fullName(row.original)}`"
                  />
                </UDropdownMenu>
              </div>
            </template>
          </UTable>

          <ul class="divide-y divide-default rounded-lg border border-default bg-elevated md:hidden">
            <li v-for="c in list" :key="c.id" class="space-y-3 p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <ULink :to="teamPath(team, c.userId)" class="font-semibold text-primary hover:underline">
                    {{ fullName(c) }}
                  </ULink>
                  <p class="text-sm text-muted">{{ describe(c) }}</p>
                  <p v-if="statusNote(c)" class="text-sm text-muted">{{ statusNote(c) }}</p>
                </div>
                <UDropdownMenu :items="rowActions(c)" :content="{ align: 'end' }">
                  <UButton
                    class="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    icon="i-lucide-ellipsis-vertical"
                    color="neutral"
                    variant="ghost"
                    size="lg"
                    :aria-label="`Azioni per ${fullName(c)}`"
                  />
                </UDropdownMenu>
              </div>
              <div class="flex flex-wrap gap-2">
                <StaffConvocationBadge :status="c.status" :confirmed="c.confirmed" />
                <IcStatusBadge kind="staffAvailability" :value="c.available ? 'available' : 'missing'" />
                <StaffContractBadge v-if="c.status === 'accepted' && !c.confirmed" :state="c.contract" />
              </div>
              <p v-if="c.declineReason" class="text-sm text-muted">«{{ c.declineReason }}»</p>
              <UFormField v-if="roleEditable(c)" label="Ruolo nella sessione">
                <USelect
                  :model-value="c.role ?? undefined"
                  :items="roleItems"
                  placeholder="Scegli il ruolo"
                  class="w-full"
                  @update:model-value="value => changeRole(c, value as string)"
                />
              </UFormField>
              <p v-else class="text-sm">
                <span class="text-muted">Ruolo:</span> {{ roleName(c.role) ?? 'Non indicato' }}
              </p>
              <UCheckbox
                v-if="editable && c.status === 'draft' && c.sendable"
                :model-value="selected.includes(c.id)"
                label="Seleziona per l’invio"
                class="py-2"
                @update:model-value="value => toggleSelected(c.id, value === true)"
              />
            </li>
          </ul>
        </template>
      </IcSection>
    </template>

    <StaffAddStaffModal
      v-if="data"
      v-model:open="addOpen"
      :session-id="sessionId"
      :team="addTeam"
      :available="data.available"
      @added="afterChange"
    />
    <StaffSendConvocationsModal
      v-if="session"
      v-model:open="sendOpen"
      :session-id="sessionId"
      :session-title="session.title"
      :convocations="sendList"
      @sent="afterChange"
    />
  </div>
</template>
