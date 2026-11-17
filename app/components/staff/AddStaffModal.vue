<script setup lang="ts">
import type { AvailableStaff } from '#shared/types/staff'
import { COORDINATOR_ROLE, OF_TEAM, type StaffTeam } from '#shared/utils/constants'
import { ageOn } from '#shared/utils/dates'
import { formatAge, fullName } from '#shared/utils/format'
import { teamPath } from '#shared/utils/routes'

// Picks people of one team for a session, among the approved ones who said they can come to it (spec 3.5):
// their roles, age and «Valutazione», the role they will have. They are added as convocations to send
// (drafts): nothing is emailed here.
const props = defineProps<{ sessionId: string; team: StaffTeam; available: AvailableStaff[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [count: number] }>()

const api = useApi()
const { roleItems, roleFilterItems, roleList, tagsOf } = useStaffLabels()

const roleFilter = ref('all')
/** userId → role in the session (null: to decide later), for the people ticked. */
const chosen = ref<Record<string, string | null>>({})
const saving = ref(false)

watch(open, value => {
  if (!value) return
  chosen.value = {}
  roleFilter.value = 'all'
})

const ofTeam = computed(() => props.available.filter(person => person.team === props.team))
const visible = computed(() =>
  ofTeam.value.filter(person => roleFilter.value === 'all' || person.roles.includes(roleFilter.value)),
)
const count = computed(() => Object.keys(chosen.value).length)
const ticked = (person: AvailableStaff) => person.userId in chosen.value

function toggle(person: AvailableStaff, value: boolean) {
  const next = { ...chosen.value }
  if (value) {
    // The role filtered on, else the first role of the application that is not the coordinator (one per team).
    const filtered = roleFilter.value !== 'all' && person.roles.includes(roleFilter.value) ? roleFilter.value : null
    next[person.userId] = filtered ?? person.roles.find(role => role !== COORDINATOR_ROLE) ?? person.roles[0] ?? null
  } else {
    delete next[person.userId]
  }
  chosen.value = next
}

function describe(person: AvailableStaff): string {
  const age = person.birthDate && formatAge(ageOn(person.birthDate))
  return [roleList(person.roles, 'Ruolo non indicato'), age, person.city].filter(Boolean).join(' · ')
}

const PREVIOUS = { declined: 'Aveva rifiutato la convocazione', cancelled: 'La convocazione era stata annullata' }

async function add() {
  saving.value = true
  try {
    const result = await api<{ added: number; kept: number }>('/api/admin/convocations', {
      method: 'POST',
      body: {
        sessionId: props.sessionId,
        people: Object.entries(chosen.value).map(([userId, role]) => ({ userId, role })),
      },
    })
    notifySuccess(
      result.added === 1 ? 'Una persona aggiunta' : `${result.added} persone aggiunte`,
      'Le convocazioni sono da inviare: nessuna email è partita.',
    )
    open.value = false
    emit('added', result.added)
  } catch (error) {
    notifyError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Aggiungi persone ${OF_TEAM[team]}`"
    description="Qui trovi solo chi ha detto che c’è per tutta la sessione. Scegli le persone e il ruolo che avranno: le aggiungi come convocazioni da inviare, nessuna email parte adesso."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <UEmpty
        v-if="!ofTeam.length"
        icon="i-lucide-users"
        title="Nessuna persona da aggiungere"
        description="Chi ha dato disponibilità per questa sessione è già tra i convocati, oppure nessuno l’ha ancora data. Ognuno la indica dalla sua area, sessione per sessione."
        :actions="[
          { label: 'Vai all’elenco', to: `${teamPath(team)}?tab=approved`, color: 'neutral', variant: 'outline' },
        ]"
      />
      <template v-else>
        <UFormField label="Ruolo" class="mb-4 sm:max-w-xs">
          <USelect v-model="roleFilter" :items="roleFilterItems" class="w-full" />
        </UFormField>

        <p v-if="!visible.length" class="py-6 text-center text-muted">
          Nessuna persona corrisponde al filtro: prova con un altro ruolo.
        </p>
        <ul v-else class="divide-y divide-default rounded-lg border border-default">
          <li v-for="person in visible" :key="person.userId" class="space-y-3 p-3 sm:p-4">
            <UCheckbox
              :model-value="ticked(person)"
              :label="fullName(person)"
              :description="describe(person)"
              class="py-1"
              :ui="{ label: 'font-semibold text-highlighted', description: 'text-sm text-muted' }"
              @update:model-value="value => toggle(person, value === true)"
            />
            <StaffTags :tags="tagsOf(person.tags)" class="ps-6" />
            <p v-if="person.previousStatus" class="ps-6 text-sm text-muted">{{ PREVIOUS[person.previousStatus] }}</p>
            <UFormField v-if="ticked(person)" label="Ruolo nella sessione" class="ps-6 sm:max-w-xs">
              <USelect
                :model-value="chosen[person.userId] ?? undefined"
                :items="roleItems"
                placeholder="Da decidere"
                class="w-full"
                @update:model-value="value => (chosen[person.userId] = value as string)"
              />
            </UFormField>
          </li>
        </ul>
      </template>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <UButton
          class="pointer-coarse:min-h-11"
          color="neutral"
          variant="outline"
          label="Annulla"
          @click="open = false"
        />
        <UButton
          class="pointer-coarse:min-h-11"
          icon="i-lucide-user-plus"
          :label="count === 1 ? 'Aggiungi una persona' : `Aggiungi ${count} persone`"
          :disabled="!count"
          :loading="saving"
          @click="add"
        />
      </div>
    </template>
  </UModal>
</template>
