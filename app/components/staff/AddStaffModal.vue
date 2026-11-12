<script setup lang="ts">
import type { AvailableStaff } from '#shared/types/staff'
import type { StaffRole, StaffTeam } from '#shared/utils/constants'
import { fullName } from '#shared/utils/format'

// Picks people for a session among the approved staff and v-team who said they can come to it (spec 3.5):
// their team, their roles, the role they will have. They are added as convocations to send (drafts):
// nothing is emailed here.
const props = defineProps<{ sessionId: string; available: AvailableStaff[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [count: number] }>()

const api = useApi()
const { label, options } = useEnums()

const roleFilter = ref<StaffRole | 'all'>('all')
const teamFilter = ref<StaffTeam | 'all'>('all')
/** userId → role in the session, for the people ticked. */
const chosen = ref<Record<string, StaffRole>>({})
const saving = ref(false)

watch(open, value => {
  if (!value) return
  chosen.value = {}
  roleFilter.value = 'all'
  teamFilter.value = 'all'
})

const roleItems = computed(() => options('staffRole').map(option => ({ label: option.label, value: option.value })))
const roleFilterItems = computed(() => [{ label: 'Tutti i ruoli', value: 'all' }, ...roleItems.value])
const teamItems = computed(() => [
  { label: 'Staff e v-team', value: 'all' },
  ...options('staffTeam').map(option => ({ label: option.label, value: option.value })),
])

const visible = computed(() =>
  props.available.filter(
    person =>
      (roleFilter.value === 'all' || person.roles.includes(roleFilter.value)) &&
      (teamFilter.value === 'all' || person.team === teamFilter.value),
  ),
)
const count = computed(() => Object.keys(chosen.value).length)

function toggle(person: AvailableStaff, value: boolean) {
  const next = { ...chosen.value }
  if (value) {
    // The role filtered on, else the first role of the application that is not the coordinator (one per team).
    const filtered = roleFilter.value !== 'all' && person.roles.includes(roleFilter.value) ? roleFilter.value : null
    next[person.userId] = filtered ?? person.roles.find(role => role !== 'coordinator') ?? person.roles[0] ?? 'other'
  } else {
    delete next[person.userId]
  }
  chosen.value = next
}

function describe(person: AvailableStaff): string {
  const roles = person.roles.map(role => label('staffRole', role)).join(', ') || 'Ruolo non indicato'
  return [label('staffTeam', person.team), roles, person.city].filter(Boolean).join(' · ')
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
    title="Aggiungi persone alla sessione"
    description="Qui trovi solo chi ha detto che c’è per tutta la sessione. Scegli le persone e il ruolo che avranno: le aggiungi come convocazioni da inviare, nessuna email parte adesso."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <UEmpty
        v-if="!available.length"
        icon="i-lucide-users"
        title="Nessuna persona da aggiungere"
        description="Chi ha dato disponibilità per questa sessione è già tra i convocati, oppure nessuno l’ha ancora data. Staff e v-team la indicano dalla loro area, sessione per sessione."
        :actions="[{ label: 'Vai allo staff', to: '/admin/staff?tab=approved', color: 'neutral', variant: 'outline' }]"
      />
      <template v-else>
        <div class="mb-4 grid gap-3 sm:grid-cols-2">
          <UFormField label="Squadra">
            <USelect v-model="teamFilter" :items="teamItems" class="w-full" />
          </UFormField>
          <UFormField label="Ruolo">
            <USelect v-model="roleFilter" :items="roleFilterItems" class="w-full" />
          </UFormField>
        </div>

        <p v-if="!visible.length" class="py-6 text-center text-muted">
          Nessuna persona corrisponde ai filtri: prova con un’altra squadra o un altro ruolo.
        </p>
        <ul v-else class="divide-y divide-default rounded-lg border border-default">
          <li v-for="person in visible" :key="person.userId" class="space-y-3 p-3 sm:p-4">
            <UCheckbox
              :model-value="Boolean(chosen[person.userId])"
              :label="fullName(person)"
              :description="describe(person)"
              class="py-1"
              :ui="{ label: 'font-semibold text-highlighted', description: 'text-sm text-muted' }"
              @update:model-value="value => toggle(person, value === true)"
            />
            <p v-if="person.previousStatus" class="ps-6 text-sm text-muted">{{ PREVIOUS[person.previousStatus] }}</p>
            <UFormField v-if="chosen[person.userId]" label="Ruolo nella sessione" class="ps-6 sm:max-w-xs">
              <USelect v-model="chosen[person.userId]" :items="roleItems" class="w-full" />
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
