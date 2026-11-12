<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'
import type { SessionGroupFamily, SessionGroupStaff, SessionGroupsDto } from '#shared/types/activity-groups'
import { tallyGroups, tallyLabel } from '#shared/utils/activity-groups'
import { PROGRAMME_GROUP_LABELS, PROGRAMME_GROUPS, enumLabel, type ProgrammeGroup } from '#shared/utils/constants'
import { plural } from '#shared/utils/format'

// The Gruppi tab of a session (docs/spec.md 3.12): the families holding a place split among the groups of
// the programme, Giallo, Rosso and Blu, each with its leader from the session staff. Saving sends no email.
const props = defineProps<{ sessionId: string }>()

const api = useApi()
const base = computed(() => `/api/admin/sessions/${props.sessionId}/groups`)
const { data, status, refresh } = useApiFetch<SessionGroupsDto>(() => base.value)

const families = computed(() => data.value?.families ?? [])
const waiting = computed(() => families.value.filter(family => !family.group))
const tally = computed(() => tallyGroups(families.value))
const groups = computed(() =>
  PROGRAMME_GROUPS.map(group => ({
    group,
    label: PROGRAMME_GROUP_LABELS[group],
    families: families.value.filter(family => family.group === group),
    leader: data.value?.staff.find(person => person.group === group),
  })),
)

const summary = computed(() =>
  families.value.length
    ? [
        `${families.value.length - waiting.value.length} su ${plural(families.value.length, 'famiglia', 'famiglie')} in un gruppo`,
        waiting.value.length && `${waiting.value.length} senza gruppo`,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined,
)

/** "Convocazione: da inviare" while the person has not accepted yet. */
const convocationNote = (person: SessionGroupStaff) =>
  person.status === 'accepted'
    ? undefined
    : `Convocazione: ${enumLabel('convocationStatus', person.status).toLowerCase()}`

/** The people who can lead `group`: the session staff, saying who leads another group already. */
const leaderItems = (group: ProgrammeGroup): SelectMenuItem[] =>
  (data.value?.staff ?? []).map(person => ({
    label: person.name,
    value: person.id,
    description: [
      person.role && enumLabel('staffRole', person.role),
      convocationNote(person),
      person.group && person.group !== group && `Guida il gruppo ${PROGRAMME_GROUP_LABELS[person.group]}`,
    ]
      .filter(Boolean)
      .join(' · '),
  }))

/** What is being saved: a participation id, `leader:<group>` or `distribute`. */
const saving = ref<string | null>(null)
async function save(key: string, request: () => Promise<SessionGroupsDto>, failure: string) {
  saving.value = key
  try {
    data.value = await request()
  } catch (error) {
    notifyError(error, failure)
    await refresh()
  } finally {
    saving.value = null
  }
}

function assign(family: SessionGroupFamily, group: ProgrammeGroup | null) {
  if (group === family.group) return
  const url: string = `${base.value}/${family.id}`
  return save(family.id, () => api<SessionGroupsDto>(url, { method: 'PUT', body: { group } }), 'Gruppo non salvato')
}

function chooseLeader(group: ProgrammeGroup, convocationId: string | null) {
  const url: string = `${base.value}/leader`
  return save(
    `leader:${group}`,
    () => api<SessionGroupsDto>(url, { method: 'PUT', body: { group, convocationId } }),
    'Responsabile non salvato',
  )
}

function distribute() {
  const url: string = `${base.value}/distribute`
  return save(
    'distribute',
    async () => {
      const result = await api<SessionGroupsDto & { placed: number }>(url, { method: 'POST' })
      notifySuccess(`${plural(result.placed, 'famiglia divisa', 'famiglie divise')} nei gruppi`)
      return result
    },
    'Famiglie non divise nei gruppi',
  )
}
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
      title="Non riesco a caricare i gruppi della sessione"
      description="Controlla la connessione e riprova."
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <IcSection v-else title="Gruppi attività" :description="summary">
      <template #actions>
        <UButton
          class="pointer-coarse:min-h-11"
          :to="`${base}/export`"
          external
          download
          icon="i-lucide-download"
          label="Scarica i gruppi (CSV)"
          color="neutral"
          variant="outline"
        />
        <UButton
          v-if="data.editable && waiting.length"
          class="pointer-coarse:min-h-11"
          icon="i-lucide-shuffle"
          label="Dividi le famiglie senza gruppo"
          :loading="saving === 'distribute'"
          :disabled="saving !== null"
          @click="distribute"
        />
      </template>

      <UAlert
        v-if="!data.editable"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        title="La sessione è conclusa o annullata"
        description="I gruppi restano qui per lo storico e non si possono più cambiare."
        class="mb-6"
      />

      <UEmpty
        v-if="!families.length"
        icon="i-lucide-heart-handshake"
        title="Nessuna famiglia con un posto"
        description="Qui compaiono le famiglie titolari della sessione, finché non rinunciano: le riserve entrano in un gruppo quando vengono chiamate."
      />

      <template v-else>
        <section v-if="waiting.length" aria-labelledby="groups-waiting" class="mb-8">
          <h3 id="groups-waiting" class="font-semibold text-highlighted">Senza gruppo</h3>
          <p class="mb-3 text-sm text-muted">
            Scegli il gruppo di ogni famiglia, oppure dividile tutte insieme: i gruppi restano pari per numero di
            persone, e poi puoi spostare chi vuoi.
          </p>
          <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
            <GroupsFamilyItem
              v-for="family in waiting"
              :key="family.id"
              :family="family"
              :disabled="!data.editable || saving !== null"
              :loading="saving === family.id"
              @assign="group => assign(family, group)"
            />
          </ul>
        </section>

        <div class="grid gap-4 lg:grid-cols-3">
          <section
            v-for="column in groups"
            :key="column.group"
            :aria-labelledby="`group-${column.group}`"
            class="rounded-lg border border-default bg-elevated"
          >
            <div class="space-y-3 border-b border-default p-4">
              <div>
                <h3 :id="`group-${column.group}`" class="flex items-center gap-2 font-semibold text-highlighted">
                  <ProgrammeGroupDot :group="column.group" />
                  Gruppo {{ column.label }}
                </h3>
                <p class="text-sm text-muted">{{ tallyLabel(tally[column.group]) }}</p>
              </div>
              <UFormField
                label="Responsabile"
                :help="
                  data.staff.length
                    ? column.leader && convocationNote(column.leader)
                    : 'Convoca lo staff nella scheda Staff per sceglierlo.'
                "
              >
                <USelectMenu
                  :model-value="column.leader?.id"
                  :items="leaderItems(column.group)"
                  value-key="value"
                  placeholder="Nessun responsabile"
                  :search-input="data.staff.length > 8 ? { placeholder: 'Cerca nello staff' } : false"
                  :disabled="!data.editable || !data.staff.length || saving !== null"
                  :loading="saving === `leader:${column.group}`"
                  :aria-label="`Responsabile del gruppo ${column.label}`"
                  clear
                  class="w-full"
                  @update:model-value="
                    value => chooseLeader(column.group, (value as string | null | undefined) ?? null)
                  "
                />
              </UFormField>
            </div>
            <ul v-if="column.families.length" class="divide-y divide-default">
              <GroupsFamilyItem
                v-for="family in column.families"
                :key="family.id"
                :family="family"
                :disabled="!data.editable || saving !== null"
                :loading="saving === family.id"
                @assign="group => assign(family, group)"
              />
            </ul>
            <p v-else class="p-4 text-sm text-muted">Ancora nessuna famiglia.</p>
          </section>
        </div>
      </template>
    </IcSection>
  </div>
</template>
