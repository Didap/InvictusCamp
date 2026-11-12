<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { StaffDetail } from '#shared/types/staff'
import type { StaffStatus, StaffTeam } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDateTime, formatDay, formatDayRange, fullName } from '#shared/utils/format'

// One staff member (spec 3.4): contacts, application, review with internal notes, the outcome email sent
// only from "Comunica l’esito", availability, convocations, personal documents, signatures.
const route = useRoute()
const userId = computed(() => String(route.params.userId))
const api = useApi()
const confirm = useConfirm()
const { label, meta, options } = useEnums()
const { data: person, refresh } = await useApiFetch<StaffDetail>(() => `/api/admin/staff/${userId.value}`)

const name = computed(() => (person.value ? fullName(person.value) : ''))
const dayOf = (instant: string | null) => (instant ? formatDay(todayIso(new Date(instant)), 'long') : '')
const today = todayIso()

// ─── Review ───
const notes = ref('')
watch(
  () => person.value?.reviewNotes,
  value => {
    notes.value = value ?? ''
  },
  { immediate: true },
)
const notesChanged = computed(() => notes.value.trim() !== (person.value?.reviewNotes ?? '').trim())
const savingNotes = ref(false)
async function saveNotes() {
  savingNotes.value = true
  try {
    await api(`/api/admin/staff/${userId.value}/notes`, { method: 'PUT', body: { notes: notes.value } })
    notifySuccess('Note salvate')
    await refresh()
  } catch (error) {
    notifyError(error)
  } finally {
    savingNotes.value = false
  }
}

// ─── Team: staff or v-team, chosen in the application ───
const teamItems = computed(() => options('staffTeam').map(option => ({ label: option.label, value: option.value })))
const savingTeam = ref(false)
async function changeTeam(team: StaffTeam) {
  if (!person.value || team === person.value.team) return
  savingTeam.value = true
  try {
    const url: string = `/api/admin/staff/${userId.value}/team`
    await api(url, { method: 'PUT', body: { team } })
    if (person.value) person.value = { ...person.value, team }
    notifySuccess('Squadra cambiata', `${name.value}: ${label('staffTeam', team)}`)
  } catch (error) {
    notifyError(error)
    await refresh()
  } finally {
    savingTeam.value = false
  }
}

const NO_EMAIL = 'Nessuna email parte adesso: l’esito lo comunichi tu, quando vuoi, con «Comunica l’esito».'
const moving = ref<StaffStatus | null>(null)
async function move(to: StaffStatus) {
  const from = person.value?.status
  if (!from) return
  const questions: Partial<
    Record<StaffStatus, { title: string; description: string; confirmLabel: string; danger?: boolean }>
  > = {
    approved:
      from === 'inactive'
        ? {
            title: `Riattivi ${name.value}?`,
            description:
              'Torna nello staff approvato: può indicare la disponibilità e ricevere convocazioni. Nessuna email parte.',
            confirmLabel: 'Riattiva',
          }
        : {
            title: `Approvi la candidatura di ${name.value}?`,
            description: `Potrà indicare la disponibilità e ricevere convocazioni. ${NO_EMAIL}`,
            confirmLabel: 'Approva',
          },
    rejected: {
      title: `Non selezioni ${name.value}?`,
      description: `Nella sua area vedrà che la candidatura non è stata accolta. ${NO_EMAIL}`,
      confirmLabel: 'Non selezionare',
      danger: true,
    },
    inactive: {
      title: `Disattivi ${name.value}?`,
      description:
        'Non riceverà più convocazioni e non potrà indicare la disponibilità. Le convocazioni già inviate restano: se serve, annullale dalla sessione. Nessuna email parte.',
      confirmLabel: 'Disattiva',
      danger: true,
    },
  }
  const question = questions[to]
  if (!question || !(await confirm(question))) return
  moving.value = to
  try {
    await api(`/api/admin/staff/${userId.value}/status`, { method: 'POST', body: { status: to, notes: notes.value } })
    notifySuccess(
      to === 'approved'
        ? from === 'inactive'
          ? 'Di nuovo nello staff approvato'
          : 'Candidatura approvata'
        : to === 'rejected'
          ? 'Candidatura non selezionata'
          : 'Profilo disattivato',
      to === 'inactive' || from === 'inactive' ? undefined : 'Ricordati di comunicare l’esito.',
    )
    await refresh()
  } catch (error) {
    notifyError(error)
  } finally {
    moving.value = null
  }
}

const outcomeOpen = ref(false)
const outcomePending = computed(() => Boolean(person.value?.outcome.template && !person.value.outcome.sentAt))

const statusLine = computed(() => {
  const p = person.value
  if (!p) return ''
  const by = p.reviewedByName ? ` da ${p.reviewedByName}` : ''
  switch (p.status) {
    case 'registered':
      return 'Ha creato l’account e non ha ancora inviato la candidatura: potrai valutarla dopo l’invio.'
    case 'applied':
      return `Candidatura inviata il ${dayOf(p.appliedAt)}: da valutare.`
    case 'approved':
      return p.reviewedAt ? `Candidatura approvata il ${dayOf(p.reviewedAt)}${by}.` : 'Nello staff approvato.'
    case 'rejected':
      return p.reviewedAt
        ? `Candidatura non selezionata il ${dayOf(p.reviewedAt)}${by}.`
        : 'Candidatura non selezionata.'
    default:
      return 'Non riceve convocazioni e non può indicare la disponibilità.'
  }
})

const moreItems = computed<DropdownMenuItem[][]>(() =>
  person.value?.status === 'approved'
    ? [[{ label: 'Disattiva', icon: 'i-lucide-pause', color: 'error', onSelect: () => move('inactive') }]]
    : [],
)

const contacts = computed(() => {
  const p = person.value
  if (!p) return []
  return [
    { label: 'Email', value: p.email },
    { label: 'Telefono', value: p.phone },
    { label: 'Città', value: p.city },
    { label: 'Data di nascita', value: formatDay(p.birthDate, 'long') },
    { label: 'Account creato il', value: dayOf(p.createdAt) },
  ]
})

const texts = computed(() => {
  const p = person.value
  if (!p) return []
  return [
    { label: 'Titoli e qualifiche', value: p.qualifications },
    { label: 'Esperienze', value: p.experience },
    { label: 'Motivazione', value: p.motivation },
  ]
})

/** The sessions the person can come to: the ones still ahead first. */
const availability = computed(() => {
  const all = person.value?.availability ?? []
  return [...all.filter(s => s.startDate > today), ...all.filter(s => s.startDate <= today).reverse()]
})

function convocationNote(c: StaffDetail['convocations'][number]): string {
  if (c.status === 'sent' && c.sentAt) return `Inviata il ${dayOf(c.sentAt)}`
  if ((c.status === 'accepted' || c.status === 'declined') && c.respondedAt) {
    return `${c.status === 'accepted' ? 'Accettata' : 'Rifiutata'} il ${dayOf(c.respondedAt)}`
  }
  return ''
}
</script>

<template>
  <IcPage :title="person ? name : 'Staff'" back="/admin/staff" width="wide">
    <template #actions>
      <UButton
        class="pointer-coarse:min-h-11"
        :to="`/admin/comunicazioni/nuova?userIds=${userId}`"
        icon="i-lucide-mail"
        label="Scrivi"
        color="neutral"
        variant="outline"
      />
      <UDropdownMenu v-if="moreItems.length" :items="moreItems" :content="{ align: 'end' }">
        <UButton
          class="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          icon="i-lucide-ellipsis-vertical"
          color="neutral"
          variant="ghost"
          aria-label="Altre azioni"
        />
      </UDropdownMenu>
    </template>

    <UEmpty
      v-if="!person"
      icon="i-lucide-user-x"
      title="Persona non trovata"
      description="Forse l’account è stato eliminato. Torna all’elenco dello staff."
      :actions="[{ label: 'Vai allo staff', to: '/admin/staff', color: 'neutral', variant: 'outline' }]"
    />

    <div v-else class="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <aside class="lg:order-2" aria-label="Stato e contatti">
        <IcSection title="Valutazione">
          <div class="space-y-5">
            <div class="flex flex-wrap items-center gap-2">
              <IcStatusBadge kind="staffStatus" :value="person.status" size="lg" />
              <IcStatusBadge v-if="person.accountStatus !== 'active'" kind="userStatus" :value="person.accountStatus" />
            </div>
            <p class="text-sm text-muted">{{ statusLine }}</p>
            <UFormField
              label="Squadra"
              :help="
                person.status === 'registered'
                  ? 'La sceglie la persona nella candidatura, finché non la invia.'
                  : 'Scelta nella candidatura. Chi è nel v-team è un volontario.'
              "
            >
              <USelect
                :model-value="person.team"
                :items="teamItems"
                :loading="savingTeam"
                :disabled="person.status === 'registered'"
                class="w-full"
                @update:model-value="value => changeTeam(value as StaffTeam)"
              />
            </UFormField>

            <UAlert
              v-if="outcomePending"
              color="warning"
              variant="subtle"
              icon="i-lucide-mail-warning"
              title="Esito non ancora comunicato"
              description="Vede lo stato nella sua area, ma non ha ricevuto l’email con l’esito."
            />
            <p v-else-if="person.outcome.sentAt" class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-lucide-mail-check" class="size-4 shrink-0" aria-hidden="true" />
              Esito comunicato il {{ formatDateTime(person.outcome.sentAt) }}
            </p>

            <div class="flex flex-wrap gap-2">
              <template v-if="person.status === 'applied'">
                <UButton
                  class="pointer-coarse:min-h-11"
                  icon="i-lucide-badge-check"
                  label="Approva"
                  :loading="moving === 'approved'"
                  @click="move('approved')"
                />
                <UButton
                  class="pointer-coarse:min-h-11"
                  icon="i-lucide-circle-x"
                  label="Non selezionare"
                  color="error"
                  variant="outline"
                  :loading="moving === 'rejected'"
                  @click="move('rejected')"
                />
              </template>
              <UButton
                class="pointer-coarse:min-h-11"
                v-if="person.outcome.template"
                icon="i-lucide-send"
                label="Comunica l’esito"
                :color="outcomePending ? 'primary' : 'neutral'"
                :variant="outcomePending ? 'solid' : 'outline'"
                :disabled="person.accountStatus === 'disabled'"
                @click="outcomeOpen = true"
              />
              <UButton
                class="pointer-coarse:min-h-11"
                v-if="person.status === 'rejected'"
                icon="i-lucide-badge-check"
                label="Approva comunque"
                color="neutral"
                variant="outline"
                :loading="moving === 'approved'"
                @click="move('approved')"
              />
              <UButton
                class="pointer-coarse:min-h-11"
                v-if="person.status === 'inactive'"
                icon="i-lucide-play"
                label="Riattiva"
                :loading="moving === 'approved'"
                @click="move('approved')"
              />
            </div>

            <UFormField
              label="Note interne"
              help="Non le vede la persona. Si salvano anche quando approvi o non selezioni."
            >
              <UTextarea v-model="notes" :rows="4" autoresize :maxlength="4000" class="w-full" />
            </UFormField>
            <UButton
              class="pointer-coarse:min-h-11"
              v-if="notesChanged"
              label="Salva le note"
              icon="i-lucide-save"
              color="neutral"
              variant="outline"
              :loading="savingNotes"
              @click="saveNotes"
            />
          </div>
        </IcSection>

        <IcSection title="Contatti">
          <IcDataList :items="contacts" />
        </IcSection>
      </aside>

      <div class="min-w-0 lg:order-1">
        <IcSection
          title="Candidatura"
          :description="person.appliedAt ? `Inviata il ${dayOf(person.appliedAt)}` : 'Non ancora inviata'"
        >
          <div class="space-y-6">
            <div>
              <h3 class="text-sm font-semibold text-muted">Ruoli</h3>
              <ul v-if="person.roles.length" class="mt-2 flex flex-wrap gap-2">
                <li v-for="role in person.roles" :key="role">
                  <UBadge
                    :icon="meta('staffRole', role).icon"
                    :label="label('staffRole', role)"
                    color="neutral"
                    variant="outline"
                    size="lg"
                  />
                </li>
              </ul>
              <p v-else class="mt-1 text-dimmed">Non indicati</p>
            </div>
            <dl class="space-y-5">
              <div v-for="item in texts" :key="item.label">
                <dt class="text-sm font-semibold text-muted">{{ item.label }}</dt>
                <dd class="mt-1 max-w-prose whitespace-pre-line" :class="item.value ? '' : 'text-dimmed'">
                  {{ item.value || 'Non indicato' }}
                </dd>
              </div>
            </dl>
            <div>
              <h3 class="text-sm font-semibold text-muted">Curriculum</h3>
              <IcFileLink v-if="person.cv" :file="person.cv" class="mt-2" />
              <p v-else class="mt-1 text-dimmed">Non caricato</p>
            </div>
          </div>
        </IcSection>

        <IcSection title="Disponibilità" description="Le sessioni a cui ha detto che c’è, dal primo all’ultimo giorno.">
          <p v-if="!availability.length" class="text-muted">
            {{
              person.status === 'approved'
                ? 'Non ha ancora indicato sessioni.'
                : 'La disponibilità si indica dopo l’approvazione della candidatura.'
            }}
          </p>
          <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li
              v-for="session in availability"
              :key="session.id"
              class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
            >
              <ULink
                :to="`/admin/sessioni/${session.id}?tab=staff`"
                class="font-semibold hover:underline"
                :class="session.startDate > today ? 'text-primary' : 'text-muted'"
              >
                {{ session.title }}
              </ULink>
              <span class="text-sm text-muted tabular-nums">
                {{ formatDayRange(session.startDate, session.endDate, 'long')
                }}<template v-if="session.endDate < today"> · Passata</template
                ><template v-else-if="session.startDate <= today"> · In corso</template>
              </span>
            </li>
          </ul>
        </IcSection>

        <IcSection title="Convocazioni">
          <p v-if="!person.convocations.length" class="text-muted">Nessuna convocazione finora.</p>
          <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li v-for="c in person.convocations" :key="c.id" class="space-y-2 px-4 py-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <ULink
                    :to="`/admin/sessioni/${c.sessionId}?tab=staff`"
                    class="font-semibold text-primary hover:underline"
                  >
                    {{ c.sessionTitle }}
                  </ULink>
                  <p class="text-sm text-muted">
                    {{ formatDayRange(c.startDate, c.endDate)
                    }}<template v-if="c.role"> · {{ label('staffRole', c.role) }}</template>
                  </p>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <StaffConvocationBadge :status="c.status" :confirmed="c.confirmed" />
                  <StaffContractBadge v-if="c.status === 'accepted'" :state="c.contract" />
                </div>
              </div>
              <p v-if="convocationNote(c)" class="text-sm text-muted">{{ convocationNote(c) }}</p>
              <p v-if="c.declineReason" class="text-sm text-muted">«{{ c.declineReason }}»</p>
            </li>
          </ul>
        </IcSection>

        <IcSection title="Documenti personali" description="Caricati dalla persona: titoli, attestati, documenti.">
          <p v-if="!person.documents.length" class="text-muted">Nessun documento caricato.</p>
          <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li v-for="doc in person.documents" :key="doc.id" class="space-y-1 px-4 py-3">
              <IcFileLink :file="doc.file" :label="doc.title" />
              <p class="text-sm text-muted">
                {{ label('personalDocumentCategory', doc.category) }} · caricato il {{ dayOf(doc.createdAt) }}
              </p>
            </li>
          </ul>
        </IcSection>

        <IcSection title="Firme" description="I documenti assegnati a questa persona e il loro stato.">
          <DocumentsUserSignatures :user-id="person.userId" />
        </IcSection>
      </div>
    </div>

    <StaffOutcomeModal
      v-if="person && person.outcome.template"
      v-model:open="outcomeOpen"
      :user-id="person.userId"
      :first-name="person.firstName"
      :name="name"
      :email="person.email"
      :outcome="person.outcome"
      @sent="refresh"
    />
  </IcPage>
</template>
