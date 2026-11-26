<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { asksContract, isSheetComplete, requiredDocumentsText } from '#shared/schemas/staff'
import type { StaffDetail, StaffTagDto } from '#shared/types/staff'
import { inStaffArea, OF_TEAM, type StaffStatus, type StaffTeam } from '#shared/utils/constants'
import { ageOn, todayIso } from '#shared/utils/dates'
import {
  andList,
  formatAge,
  formatDateTime,
  formatDay,
  formatDayRange,
  formatTown,
  fullName,
  plural,
} from '#shared/utils/format'
import { TEAM_SLUG, teamOfSlug, teamPath } from '#shared/utils/routes'

// One member of the staff or of the v-team (spec 3.4), under the list of their team. Beside: status and roles, the
// review with internal notes, the outcome email sent only from «Comunica l’esito», contacts; the team, from the link
// the person applied with, moves only from the menu. Main column: personal sheet with the health data behind the
// reserved section, availability, convocations, personal documents (the CV of the application among them),
// signatures, and the training they are interested in, closed.
// Keyed by the person: moving to the list of the other team keeps the page, and what is typed in it.
definePageMeta({ path: '/admin/:team(staff|v-team)/:userId', key: route => String(route.params.userId) })
const route = useRoute()
const userId = computed(() => String(route.params.userId))
const api = useApi()
const confirm = useConfirm()
const { label, options } = useEnums()
// Started before the await, so the menus of roles and tags fill with the page.
const { roleItems, tags } = useStaffLabels()
const { data: person, refresh } = await useApiFetch<StaffDetail>(() => `/api/admin/staff/${userId.value}`)
// The team of the person (of the path, until it is loaded): an old link, or a change of team, moves to the
// list of the person.
const team = computed(() => person.value?.team ?? teamOfSlug(route.params.team))
const list = computed(() => teamPath(team.value))
watch(
  team,
  value => {
    if (value !== teamOfSlug(route.params.team)) navigateTo(teamPath(value, userId.value), { replace: true })
  },
  { immediate: true },
)

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

// ─── Roles and «Valutazione»: saved at every change ───
const tagItems = computed(() => tags.value.map(tag => ({ label: tag.name, value: tag.id, chip: { color: tag.color } })))
// The menu shows the choice at once and the saves go one after the other, so quick picks build on each other
// and the last one wins on the server too.
const savingLabels = ref<'roles' | 'tags' | null>(null)
let saving: Promise<unknown> = Promise.resolve()
function saveLabels(field: 'roles' | 'tags', ids: string[]) {
  if (!person.value) return
  person.value = { ...person.value, [field]: ids }
  savingLabels.value = field
  const url: string = `/api/admin/staff/${userId.value}/${field}`
  const save = saving
    .then(() => api<{ ok: true }>(url, { method: 'PUT', body: { [field]: ids } }))
    .catch(async error => {
      notifyError(error)
      await refresh()
    })
  saving = save
  save.finally(() => {
    if (saving === save) savingLabels.value = null
  })
}
const labelsOpen = ref(false)

// ─── Team: staff or v-team, from the link of the application; moved only for a mistake ───
const IN_TEAM: Record<StaffTeam, string> = { staff: 'nello staff', volunteer: 'nel v-team' }
const otherTeam = computed<StaffTeam>(() => (person.value?.team === 'staff' ? 'volunteer' : 'staff'))
async function changeTeam(to: StaffTeam) {
  const p = person.value
  if (!p || to === p.team) return
  const sheet = inStaffArea(p.status)
    ? to === 'volunteer'
      ? ' La formula contrattuale della scheda personale si cancella: se la scheda era pronta, riceve un’email per firmarla di nuovo.'
      : ' Nella scheda personale dovrà indicare la formula contrattuale.'
    : ''
  const ok = await confirm({
    title: `Sposti ${name.value} ${IN_TEAM[to]}?`,
    description: `Passa all’elenco ${OF_TEAM[to]}: serve se la candidatura è arrivata dal link sbagliato.${sheet}`,
    confirmLabel: `Sposta ${IN_TEAM[to]}`,
  })
  if (!ok) return
  try {
    const url: string = `/api/admin/staff/${userId.value}/team`
    await api(url, { method: 'PUT', body: { team: to } })
    if (person.value) person.value = { ...person.value, team: to }
    notifySuccess('Squadra cambiata', `${name.value} ora è nell’elenco ${OF_TEAM[to]}.`)
  } catch (error) {
    notifyError(error)
    await refresh()
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
            description: `Entra ${IN_TEAM[person.value!.team]}: compila la scheda personale, indica la disponibilità e può ricevere convocazioni. ${NO_EMAIL}`,
            confirmLabel: 'Approva la candidatura',
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
      return 'Ha creato l’account: la candidatura arriva quando conferma l’email e c’è il CV.'
    case 'applied':
      return `Candidatura inviata il ${dayOf(p.appliedAt)}: da valutare. La decidi tu: se la approvi, entra ${IN_TEAM[p.team]} e può compilare la scheda personale, indicare la disponibilità e ricevere convocazioni.`
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

const moreItems = computed<DropdownMenuItem[][]>(() => {
  const p = person.value
  if (!p) return []
  const teamMove = {
    label: `Sposta ${IN_TEAM[otherTeam.value]}`,
    icon: 'i-lucide-arrow-right-left',
    onSelect: () => changeTeam(otherTeam.value),
  }
  return p.status === 'approved'
    ? [[teamMove], [{ label: 'Disattiva', icon: 'i-lucide-pause', color: 'error', onSelect: () => move('inactive') }]]
    : [[teamMove]]
})

const contacts = computed(() => {
  const p = person.value
  if (!p) return []
  return [
    { label: 'Email', value: p.email },
    { label: 'Telefono', value: p.phone, action: whatsappLink(p.phone) },
    { label: 'Account creato il', value: dayOf(p.createdAt) },
  ]
})

/** The sheet is the approved person's to fill in: a candidate has at most what the older form asked. */
const withSheet = computed(() => inStaffArea(person.value?.status))
/** Said only while the approved person still has something to fill in. */
const sheetNote = computed(() =>
  person.value && withSheet.value && !isSheetComplete(person.value.sheet, person.value.team)
    ? 'Non ancora completa: la compila la persona.'
    : undefined,
)

/** The personal sheet the person fills in once approved (/staff/scheda). */
const sheet = computed(() => {
  const s = person.value?.sheet
  if (!s) return []
  return [
    {
      label: 'Data di nascita',
      value: s.birthDate && `${formatDay(s.birthDate, 'long')} (${formatAge(ageOn(s.birthDate, today))})`,
    },
    { label: 'Luogo di nascita', value: s.birthPlace },
    { label: 'Codice fiscale', value: s.fiscalCode },
    { label: 'Taglia della maglietta', value: s.shirtSize },
    ...(person.value && asksContract(person.value.team)
      ? [{ label: 'Formula contrattuale', value: s.contractType && label('staffContract', s.contractType) }]
      : []),
    { label: 'Indirizzo', value: s.address },
    { label: 'Città', value: formatTown(s) },
    { label: 'Regione', value: s.region },
  ].filter(item => withSheet.value || item.value)
})

/** The sessions the person can come to: the ones still ahead first. */
const availability = computed(() => {
  const all = person.value?.availability ?? []
  return [...all.filter(s => s.startDate > today), ...all.filter(s => s.startDate <= today).reverse()]
})

const documentsAlert = computed(() => {
  const missing = person.value?.documentsMissing ?? []
  return `${missing.length === 1 ? 'Manca' : 'Mancano'} ${requiredDocumentsText(missing)}`
})

/** The availability confirmed, and the reset the person asked for: «Riapri la disponibilità». */
const availabilityNote = computed(() => {
  const at = person.value?.availabilityConfirmedAt
  return at
    ? `Ultima conferma il ${dayOf(at)}: le sessioni confermate cambiano solo se riapri la disponibilità.`
    : 'Le sessioni per cui ha indicato la disponibilità, dal primo all’ultimo giorno. Non ancora confermate.'
})
const reopening = ref(false)
async function reopenAvailability() {
  const emailed = person.value?.accountStatus !== 'disabled'
  const ok = await confirm({
    title: 'Riapri la disponibilità?',
    description: `${name.value} potrà cambiare le sessioni per cui è disponibile e confermarle di nuovo. Le risposte date restano. ${
      emailed ? 'Parte 1 email.' : 'L’account è disattivato: non parte nessuna email.'
    }`,
    confirmLabel: emailed ? 'Riapri e invia 1 email' : 'Riapri',
  })
  if (!ok) return
  reopening.value = true
  try {
    const url: string = `/api/admin/staff/${userId.value}/availability-reopen`
    await api(url, { method: 'POST' })
    notifySuccess('Disponibilità riaperta', emailed ? 'Abbiamo avvisato la persona via email.' : undefined)
  } catch (error) {
    notifyError(error, 'Disponibilità non riaperta')
  } finally {
    await refresh()
    reopening.value = false
  }
}

function convocationNote(c: StaffDetail['convocations'][number]): string {
  if (c.status === 'sent' && c.sentAt) return `Inviata il ${dayOf(c.sentAt)}`
  if ((c.status === 'accepted' || c.status === 'declined') && c.respondedAt) {
    return `${c.status === 'accepted' ? 'Accettata' : 'Rifiutata'} il ${dayOf(c.respondedAt)}`
  }
  return ''
}
</script>

<template>
  <IcPage :title="person ? name : label('staffTeam', team)" :back="list" width="wide">
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
      description="Forse l’account è stato eliminato. Torna all’elenco."
      :actions="[{ label: 'Torna all’elenco', to: list, color: 'neutral', variant: 'outline' }]"
    />

    <div v-else class="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <aside class="lg:order-2" aria-label="Stato e contatti">
        <IcSection title="Stato">
          <div class="space-y-5">
            <div class="flex flex-wrap items-center gap-2">
              <IcStatusBadge kind="staffStatus" :value="person.status" size="lg" />
              <IcStatusBadge v-if="person.accountStatus !== 'active'" kind="userStatus" :value="person.accountStatus" />
            </div>
            <p class="text-sm text-muted">{{ statusLine }}</p>
            <UFormField label="Ruoli" help="Li dai tu, e li cambi quando vuoi.">
              <USelectMenu
                :model-value="person.roles"
                :items="roleItems"
                value-key="value"
                multiple
                placeholder="Nessun ruolo"
                :loading="savingLabels === 'roles'"
                class="w-full"
                @update:model-value="value => saveLabels('roles', value as string[])"
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
            <p v-else-if="person.outcome.queued" class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-lucide-clock" class="size-4 shrink-0" aria-hidden="true" />
              Esito in coda: l’email parte da sola
            </p>
            <p v-else-if="person.outcome.sentAt" class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-lucide-mail-check" class="size-4 shrink-0" aria-hidden="true" />
              Esito comunicato il {{ formatDateTime(person.outcome.sentAt) }}
            </p>

            <div class="flex flex-wrap gap-2">
              <template v-if="person.status === 'applied'">
                <UButton
                  class="pointer-coarse:min-h-11"
                  icon="i-lucide-badge-check"
                  label="Approva la candidatura"
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
          </div>
        </IcSection>

        <IcSection title="Valutazione" description="La vedi solo tu: la persona non la vede mai.">
          <div class="space-y-5">
            <UFormField label="Tag">
              <USelectMenu
                :model-value="person.tags"
                :items="tagItems"
                value-key="value"
                multiple
                placeholder="Nessun tag"
                :loading="savingLabels === 'tags'"
                class="w-full"
                @update:model-value="value => saveLabels('tags', value as string[])"
              />
            </UFormField>
            <UFormField label="Note interne" help="Si salvano anche quando approvi o non selezioni.">
              <UTextarea v-model="notes" :rows="4" autoresize :maxlength="4000" class="w-full" />
            </UFormField>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="notesChanged"
                label="Salva le note"
                icon="i-lucide-save"
                color="neutral"
                variant="outline"
                :loading="savingNotes"
                @click="saveNotes"
              />
              <UButton
                label="Gestisci ruoli e tag"
                icon="i-lucide-tags"
                color="neutral"
                variant="ghost"
                @click="labelsOpen = true"
              />
            </div>
          </div>
        </IcSection>
        <StaffLabelsModal v-model:open="labelsOpen" @deleted="refresh" />

        <IcSection title="Contatti">
          <IcDataList :items="contacts" />
        </IcSection>
      </aside>

      <div class="min-w-0 lg:order-1">
        <IcSection v-if="withSheet || sheet.length" title="Scheda personale" :description="sheetNote">
          <div class="space-y-6">
            <IcDataList :items="sheet" :columns="2" />
            <StaffReservedHealth v-if="withSheet" :user-id="person.userId" :consent-at="person.healthConsentAt" />
          </div>
        </IcSection>

        <IcSection title="Disponibilità" :description="availabilityNote">
          <template v-if="person.availabilityConfirmedAt && person.status === 'approved'" #actions>
            <UButton
              label="Riapri la disponibilità"
              icon="i-lucide-calendar-cog"
              color="neutral"
              variant="outline"
              :loading="reopening"
              class="pointer-coarse:min-h-11"
              @click="reopenAvailability"
            />
          </template>
          <UAlert
            v-if="person.availabilityResetRequestedAt"
            class="mb-4"
            color="warning"
            variant="subtle"
            icon="i-lucide-calendar-clock"
            :title="`Ha chiesto di cambiare la disponibilità il ${dayOf(person.availabilityResetRequestedAt)}`"
            description="Riaprila e la persona potrà modificarla: riceve un’email che la avvisa."
          />
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
                :to="`/admin/sessioni/${session.id}?tab=${TEAM_SLUG[team]}`"
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

        <IcSection title="Convocazioni" description="Le sessioni a cui è convocata, confermate o da confermare.">
          <p v-if="!person.convocations.length" class="text-muted">Nessuna convocazione finora.</p>
          <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li v-for="c in person.convocations" :key="c.id" class="space-y-2 px-4 py-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <ULink
                    :to="`/admin/sessioni/${c.sessionId}?tab=${TEAM_SLUG[team]}`"
                    class="font-semibold text-primary hover:underline"
                  >
                    {{ c.sessionTitle }}
                  </ULink>
                  <p class="text-sm text-muted">
                    {{ formatDayRange(c.startDate, c.endDate)
                    }}<template v-if="c.roleName"> · {{ c.roleName }}</template>
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

        <IcSection
          title="Documenti personali"
          description="Caricati dalla persona, in PDF: il curriculum, il documento d’identità, titoli e attestati."
        >
          <UAlert
            v-if="person.documentsMissing.length"
            class="mb-4"
            color="warning"
            variant="subtle"
            icon="i-lucide-file-warning"
            :title="documentsAlert"
            description="Il curriculum e il documento d’identità in PDF sono obbligatori: la persona li carica dai suoi Documenti."
          />
          <p v-if="!person.cv && !person.documents.length" class="text-muted">Nessun documento caricato.</p>
          <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <li v-if="person.cv" class="space-y-1 px-4 py-3">
              <IcFileLink :file="person.cv" label="Curriculum" />
              <p class="text-sm text-muted">
                Curriculum · inviato con la candidatura<template v-if="person.appliedAt">
                  il {{ dayOf(person.appliedAt) }}</template
                >
              </p>
            </li>
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

        <IcSection title="Formazione" description="Le formazioni proposte che le interessano.">
          <p v-if="!person.training.length" class="text-muted">Nessuna indicata.</p>
          <UCollapsible v-else>
            <UButton
              :label="`Mostra ${plural(person.training.length, 'formazione', 'formazioni')}`"
              color="neutral"
              variant="link"
              trailing-icon="i-lucide-chevron-down"
              class="px-0 pointer-coarse:min-h-11"
              :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
            />
            <template #content>
              <ul class="mt-2 list-disc space-y-1 pl-5">
                <li v-for="training in person.training" :key="training.id">{{ training.title }}</li>
              </ul>
            </template>
          </UCollapsible>
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
