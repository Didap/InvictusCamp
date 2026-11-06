<script setup lang="ts">
import { AUDIENCE_TYPE_META, AUDIENCE_TYPES, type AudienceDraft } from '#shared/schemas/communications'
import type { Paginated } from '#shared/types/api'
import type { CommunicationSessionOption } from '#shared/types/communications'
import type { UserListItem } from '#shared/types/users'
import { formatDayRange, fullName } from '#shared/utils/format'

// Who a message goes to (docs/spec.md, 3.7): all families, approved staff, candidates to review, the
// families of a session (by kind and status), the staff of a session (by status), chosen people.
const draft = defineModel<AudienceDraft>({ required: true })
const props = defineProps<{ sessions: CommunicationSessionOption[] }>()

const api = useApi()
const { label, options } = useEnums()

const typeItems = AUDIENCE_TYPES.map(type => ({ value: type, ...AUDIENCE_TYPE_META[type] }))
/** Checkboxes show the label only: an item's icon would replace the tick. */
const plain = (name: 'participationKind' | 'participationStatus' | 'convocationStatus') =>
  options(name).map(({ value, label }) => ({ value, label }))
const kindItems = plain('participationKind')
const familyStatusItems = plain('participationStatus')
const staffStatusItems = plain('convocationStatus')

const sessionItems = computed(() =>
  props.sessions.map(s => ({ value: s.id, label: s.title, description: formatDayRange(s.startDate, s.endDate) })),
)
const groupUi = { legend: 'mb-2 text-sm font-semibold text-default', fieldset: 'flex-wrap gap-x-5 gap-y-2' }
const forSession = computed(() => draft.value.type === 'session_families' || draft.value.type === 'session_staff')

// ─── Chosen people ─────────────────────────────────────────────────────────────────────────────────
interface Person {
  value: string
  label: string
  description: string
}
const known = reactive(new Map<string, Person>())
const toPerson = (user: UserListItem): Person => ({
  value: user.id,
  label: fullName(user),
  description: `${user.familyName ?? label('userRole', user.role)} · ${user.email}`,
})
const searchTerm = ref('')
const found = ref<Person[]>([])
const searching = ref(false)

async function findPeople(term: string) {
  searching.value = true
  try {
    const result = await api<Paginated<UserListItem>>('/api/admin/users', {
      query: { q: term.trim() || undefined, status: 'active', pageSize: 25 },
    })
    found.value = result.items.map(toPerson)
    for (const person of found.value) known.set(person.value, person)
  } catch (error) {
    notifyError(error, 'Ricerca non riuscita')
  } finally {
    searching.value = false
  }
}
watchDebounced(searchTerm, term => draft.value.type === 'users' && findPeople(term), { debounce: 250 })

/** Names of the people the composer was opened with (?userIds=) or a draft was saved with. */
async function loadChosen() {
  const missing = draft.value.userIds.filter(id => !known.has(id))
  if (!missing.length) return
  try {
    const result = await api<Paginated<UserListItem>>('/api/admin/users', {
      query: { ids: missing.join(','), pageSize: 200 },
    })
    for (const user of result.items) known.set(user.id, toPerson(user))
  } catch (error) {
    notifyError(error, 'Non riesco a caricare le persone scelte')
  }
}
watch(
  () => draft.value.type,
  type => {
    if (type !== 'users') return
    loadChosen()
    if (!found.value.length) findPeople('')
  },
  { immediate: true },
)

const peopleItems = computed(() => {
  const chosen = draft.value.userIds.flatMap(id => known.get(id) ?? [])
  return [...chosen, ...found.value.filter(person => !draft.value.userIds.includes(person.value))]
})
const chosenPeople = computed(() =>
  draft.value.userIds.map(id => known.get(id) ?? { value: id, label: 'Persona', description: '' }),
)
function removePerson(id: string) {
  draft.value.userIds = draft.value.userIds.filter(value => value !== id)
}
</script>

<template>
  <div class="space-y-5">
    <URadioGroup
      v-model="draft.type"
      legend="A chi scrivi"
      :items="typeItems"
      variant="card"
      :ui="{ legend: 'mb-2 text-sm font-semibold text-default', fieldset: 'grid gap-2 sm:grid-cols-2' }"
    />

    <template v-if="forSession">
      <UFormField label="Sessione" name="audience.sessionId" required>
        <USelect v-model="draft.sessionId" :items="sessionItems" placeholder="Scegli una sessione" class="w-full" />
      </UFormField>

      <template v-if="draft.type === 'session_families'">
        <UFormField name="audience.kinds">
          <UCheckboxGroup
            v-model="draft.kinds"
            legend="Tipo di partecipazione"
            :items="kindItems"
            orientation="horizontal"
            :ui="groupUi"
          />
        </UFormField>
        <UFormField
          name="audience.statuses"
          help="Le famiglie selezionate non vedono ancora la sessione: scrivi loro dopo l’invito."
        >
          <UCheckboxGroup
            v-model="draft.familyStatuses"
            legend="Stato della partecipazione"
            :items="familyStatusItems"
            orientation="horizontal"
            :ui="groupUi"
          />
        </UFormField>
      </template>

      <UFormField v-else name="audience.statuses">
        <UCheckboxGroup
          v-model="draft.staffStatuses"
          legend="Stato della convocazione"
          :items="staffStatusItems"
          orientation="horizontal"
          :ui="groupUi"
        />
      </UFormField>
    </template>

    <template v-if="draft.type === 'users'">
      <UFormField label="Persone" name="audience.userIds" required help="Solo gli account attivi.">
        <USelectMenu
          v-model="draft.userIds"
          v-model:search-term="searchTerm"
          :items="peopleItems"
          value-key="value"
          multiple
          ignore-filter
          :loading="searching"
          placeholder="Cerca per nome o email"
          :search-input="{ placeholder: 'Cerca per nome, email o famiglia' }"
          class="w-full"
        >
          <template #default>
            <span v-if="draft.userIds.length" class="truncate">
              {{ draft.userIds.length === 1 ? '1 persona scelta' : `${draft.userIds.length} persone scelte` }}
            </span>
            <span v-else class="truncate text-dimmed">Cerca per nome o email</span>
          </template>
        </USelectMenu>
      </UFormField>
      <ul v-if="chosenPeople.length" class="flex flex-wrap gap-2" aria-label="Persone scelte">
        <li v-for="person in chosenPeople" :key="person.value">
          <UBadge color="neutral" variant="outline" size="lg" :ui="{ base: 'gap-1 pe-1' }">
            {{ person.label }}
            <template #trailing>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                :aria-label="`Togli ${person.label}`"
                @click="removePerson(person.value)"
              />
            </template>
          </UBadge>
        </li>
      </ul>
    </template>
  </div>
</template>
