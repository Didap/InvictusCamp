<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'
import type { SessionLodgingFamily, SessionLodgingStaff, SessionLodgingsDto } from '#shared/types/lodgings'
import { enumLabel, enumMeta, OF_TEAM, STAFF_TEAMS, type StaffTeam } from '#shared/utils/constants'
import { NO_CARDS, plural } from '#shared/utils/format'
import { featureLabels, groupByLocation, lodgingLine, lodgingName, placeGuests } from '#shared/utils/lodgings'

// The Alloggi tab of a session (docs/spec.md 3.11): each titolare holding a place gets a lodging of the
// layout, chosen by its size and needs, and so does each member of the staff and v-team (several in one
// lodging, never with a family); below, the layout of the session lodging by lodging. Saving a choice sends
// no email.
const props = defineProps<{ sessionId: string }>()

const api = useApi()
const { data, status, refresh } = useApiFetch<SessionLodgingsDto>(
  () => `/api/admin/sessions/${props.sessionId}/lodgings`,
)

/** Each lodging with its family and what does not fit. */
const placed = computed(() =>
  data.value ? placeGuests(data.value.lodgings, data.value.families, data.value.staff) : [],
)
/** The layout of the session, by location. */
const layout = computed(() => groupByLocation(placed.value))
const warningsOf = computed(
  () => new Map(placed.value.flatMap(item => (item.family ? [[item.family.id, item.warnings] as const] : []))),
)

const summary = computed(() => {
  const families = data.value?.families.length ?? 0
  const taken = placed.value.filter(item => item.family).length
  return [
    families && `${taken} su ${plural(families, 'famiglia', 'famiglie')} con un alloggio`,
    plural(placed.value.filter(item => !item.family && !item.staff.length).length, 'alloggio libero', 'alloggi liberi'),
  ]
    .filter(Boolean)
    .join(' · ')
})

const people = (family: SessionLodgingFamily) =>
  family.people ? plural(family.people, 'persona', 'persone') : NO_CARDS

type Placed = (typeof placed.value)[number]
const staffLine = (item: Placed) => plural(item.staff.length, 'persona', 'persone')

/** The lodgings by location as choices: `taken` says why one cannot be chosen, `line` what it is. */
function menu(choice: (item: Placed) => { taken?: string; line?: string }): SelectMenuItem[][] {
  return layout.value.map(group => [
    { type: 'label', label: group.label },
    ...group.items.map(item => {
      const { taken, line } = choice(item)
      // With the location, so that the chosen one reads unambiguously in the closed select.
      const label = lodgingName(item)
      return { label, value: item.id, description: taken ?? line ?? lodgingLine(item), disabled: !!taken }
    }),
  ])
}

/** The choices of each family: lodgings of another family or of the staff named and not selectable. */
const choices = computed(
  () =>
    new Map<string, SelectMenuItem[][]>(
      (data.value?.families ?? []).map(family => [
        family.id,
        menu(item => {
          if (item.family && item.family.id !== family.id) return { taken: `Assegnato a ${item.family.familyName}` }
          return item.staff.length ? { taken: `Ci dorme lo staff: ${staffLine(item)}` } : {}
        }),
      ]),
    ),
)

/** The people convocated of one team: staff and v-team are two lists. */
const staffByTeam = computed(() => Map.groupBy(data.value?.staff ?? [], person => person.team))
const staffOf = (team: StaffTeam) => staffByTeam.value.get(team) ?? []

/** The choices of the staff: any lodging without a family, with the staff already in it. */
const staffChoices = computed(() =>
  menu(item =>
    item.family
      ? { taken: `Assegnato a ${item.family.familyName}` }
      : item.staff.length
        ? { line: `${staffLine(item)} dello staff · ${lodgingLine(item)}` }
        : {},
  ),
)

const saving = ref<string | null>(null)
/** Places a family (its participation) or a member of the staff (their convocation), or takes them out. */
async function assign(who: { id: string; lodgingId: string | null }, path: string, value: string | null | undefined) {
  const lodgingId = value ?? null
  if (lodgingId === who.lodgingId) return
  saving.value = who.id
  try {
    const url: string = `/api/admin/sessions/${props.sessionId}/lodgings/${path}`
    data.value = await api<SessionLodgingsDto>(url, { method: 'PUT', body: { lodgingId } })
  } catch (error) {
    notifyError(error, 'Alloggio non assegnato')
    await refresh()
  } finally {
    saving.value = null
  }
}
const assignFamily = (family: SessionLodgingFamily, value: string | null | undefined) =>
  assign(family, family.id, value)
const assignStaff = (person: SessionLodgingStaff, value: string | null | undefined) =>
  assign(person, `staff/${person.id}`, value)
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
      title="Non riesco a caricare gli alloggi della sessione"
      description="Controlla la connessione e riprova."
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <UEmpty
      v-else-if="!data.lodgings.length"
      icon="i-lucide-bed-double"
      title="Ancora nessun alloggio"
      description="Inserisci lo schema dei posti letto del camp: lo fai una volta sola e vale per tutte le sessioni."
      :actions="[{ label: 'Inserisci gli alloggi', icon: 'i-lucide-plus', to: '/admin/alloggi' }]"
    />

    <template v-else>
      <IcSection title="Famiglie e alloggi" :description="summary">
        <template #actions>
          <UButton
            class="pointer-coarse:min-h-11"
            to="/admin/alloggi"
            icon="i-lucide-bed-double"
            label="Schema dei posti letto"
            color="neutral"
            variant="ghost"
          />
          <UButton
            class="pointer-coarse:min-h-11"
            :to="`/api/admin/sessions/${sessionId}/lodgings/export`"
            external
            download
            icon="i-lucide-download"
            label="Scarica CSV"
            color="neutral"
            variant="outline"
          />
          <UButton
            class="pointer-coarse:min-h-11"
            :to="`/api/admin/sessions/${sessionId}/lodgings/pdf`"
            external
            download
            icon="i-lucide-file-down"
            label="Genera PDF dello schema"
          />
        </template>

        <UAlert
          v-if="!data.editable"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          title="La sessione è conclusa o annullata"
          description="Gli alloggi restano qui per lo storico e non si possono più cambiare."
          class="mb-6"
        />

        <UEmpty
          v-if="!data.families.length"
          icon="i-lucide-heart-handshake"
          title="Nessuna famiglia con un posto"
          description="Qui compaiono le famiglie titolari della sessione, finché non rinunciano: le riserve ricevono un alloggio quando vengono chiamate."
        />

        <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li
            v-for="family in data.families"
            :key="family.id"
            class="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between"
          >
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <ULink
                  :to="`/admin/famiglie/${family.familyId}`"
                  class="font-semibold text-highlighted hover:underline"
                >
                  {{ family.familyName }}
                </ULink>
                <IcStatusBadge kind="participationStatus" :value="family.status" />
              </div>
              <p class="text-sm text-muted">
                {{ people(family) }}
                <template v-if="family.needs.length"> · Esigenze: {{ featureLabels(family.needs) }}</template>
              </p>
              <p
                v-for="warning in warningsOf.get(family.id) ?? []"
                :key="warning"
                class="flex items-start gap-1.5 text-sm text-warning"
              >
                <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {{ warning }}
              </p>
            </div>
            <UFormField label="Alloggio" class="w-full shrink-0 md:w-72">
              <USelectMenu
                :model-value="family.lodgingId ?? undefined"
                :items="choices.get(family.id) ?? []"
                value-key="value"
                placeholder="Nessun alloggio"
                :search-input="data.lodgings.length > 8 ? { placeholder: 'Cerca un alloggio' } : false"
                :disabled="!data.editable || saving !== null"
                :loading="saving === family.id"
                :aria-label="`Alloggio di ${family.familyName}`"
                clear
                class="w-full"
                @update:model-value="value => assignFamily(family, value as string | null | undefined)"
              />
            </UFormField>
          </li>
        </ul>
      </IcSection>

      <IcSection
        v-for="team in STAFF_TEAMS"
        :key="team"
        :title="enumLabel('staffTeam', team)"
        description="Chi è convocato alla sessione. Più persone possono dormire nello stesso alloggio, mai con una famiglia."
      >
        <UEmpty
          v-if="!staffOf(team).length"
          :icon="enumMeta('staffTeam', team).icon"
          :title="`Nessuna persona ${OF_TEAM[team]} convocata`"
          description="Qui compaiono le persone convocate alla sessione, finché non rifiutano."
        />
        <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li
            v-for="person in staffOf(team)"
            :key="person.id"
            class="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
          >
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <span class="font-semibold text-highlighted">{{ person.name }}</span>
              <IcStatusBadge kind="convocationStatus" :value="person.status" />
            </div>
            <UFormField label="Alloggio" class="w-full shrink-0 md:w-72">
              <USelectMenu
                :model-value="person.lodgingId ?? undefined"
                :items="staffChoices"
                value-key="value"
                placeholder="Nessun alloggio"
                :search-input="data.lodgings.length > 8 ? { placeholder: 'Cerca un alloggio' } : false"
                :disabled="!data.editable || saving !== null"
                :loading="saving === person.id"
                :aria-label="`Alloggio di ${person.name}`"
                clear
                class="w-full"
                @update:model-value="value => assignStaff(person, value as string | null | undefined)"
              />
            </UFormField>
          </li>
        </ul>
      </IcSection>

      <IcSection
        title="Schema della sessione"
        description="Località per località, chi dorme in ogni alloggio: è lo schema del PDF, con il telefono del referente di ogni famiglia."
      >
        <div v-for="group in layout" :key="group.location" class="mb-8 last:mb-0">
          <h3 class="mb-3 font-semibold text-highlighted">{{ group.label }}</h3>
          <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <li
              v-for="item in group.items"
              :key="item.id"
              class="rounded-lg border p-4"
              :class="item.family || item.staff.length ? 'border-default bg-elevated' : 'border-dashed border-default'"
            >
              <p class="font-semibold text-highlighted">{{ item.name }}</p>
              <p class="text-sm text-muted">{{ lodgingLine(item) }}</p>
              <p v-if="item.description" class="text-sm text-muted">{{ item.description }}</p>
              <p v-if="item.family" class="mt-2 flex items-center gap-1.5 text-sm">
                <UIcon name="i-lucide-heart-handshake" class="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span class="font-medium text-default">{{ item.family.familyName }}</span>
                <span class="text-muted">· {{ people(item.family) }}</span>
              </p>
              <p v-else-if="item.staff.length" class="mt-2 flex items-start gap-1.5 text-sm">
                <UIcon name="i-lucide-id-card" class="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                <span class="text-default">{{ item.staff.map(person => person.name).join(', ') }}</span>
              </p>
              <p v-else class="mt-2 text-sm text-muted">Libero</p>
              <p
                v-for="warning in item.warnings"
                :key="warning"
                class="mt-1 flex items-start gap-1.5 text-sm text-warning"
              >
                <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {{ warning }}
              </p>
            </li>
          </ul>
        </div>
      </IcSection>
    </template>
  </div>
</template>
