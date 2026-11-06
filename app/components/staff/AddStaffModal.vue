<script setup lang="ts">
import type { AvailableStaff } from '#shared/types/staff'
import type { StaffRole } from '#shared/utils/constants'
import { formatDayRange, fullName } from '#shared/utils/format'

// Picks approved staff for a session: how their availability covers its dates, their roles, the role
// they will have. They are added as convocations to send (drafts): nothing is emailed here.
const props = defineProps<{ sessionId: string; available: AvailableStaff[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [count: number] }>()

const api = useApi()
const { label, options } = useEnums()

type CoverageFilter = 'all' | 'full' | 'some'
const roleFilter = ref<StaffRole | 'all'>('all')
const coverageFilter = ref<CoverageFilter>('all')
/** userId → role in the session, for the people ticked. */
const chosen = ref<Record<string, StaffRole>>({})
const saving = ref(false)

watch(open, value => {
  if (!value) return
  chosen.value = {}
  roleFilter.value = 'all'
  coverageFilter.value = 'all'
})

const roleItems = computed(() => options('staffRole').map(option => ({ label: option.label, value: option.value })))
const roleFilterItems = computed(() => [{ label: 'Tutti i ruoli', value: 'all' }, ...roleItems.value])
const coverageItems: { label: string; value: CoverageFilter }[] = [
  { label: 'Qualsiasi disponibilità', value: 'all' },
  { label: 'Copre tutte le date', value: 'full' },
  { label: 'Copre almeno qualche giorno', value: 'some' },
]

const visible = computed(() =>
  props.available.filter(
    person =>
      (roleFilter.value === 'all' || person.roles.includes(roleFilter.value)) &&
      (coverageFilter.value === 'all' ||
        (coverageFilter.value === 'full' ? person.coverage === 'full' : person.coverage !== 'none')),
  ),
)
const count = computed(() => Object.keys(chosen.value).length)

function toggle(person: AvailableStaff, value: boolean) {
  const next = { ...chosen.value }
  if (value) {
    const filtered = roleFilter.value !== 'all' && person.roles.includes(roleFilter.value) ? roleFilter.value : null
    next[person.userId] = filtered ?? person.roles[0] ?? 'other'
  } else {
    delete next[person.userId]
  }
  chosen.value = next
}

function describe(person: AvailableStaff): string {
  const roles = person.roles.map(role => label('staffRole', role)).join(', ') || 'Ruolo non indicato'
  return person.city ? `${roles} · ${person.city}` : roles
}

function periodsText(person: AvailableStaff): string {
  if (!person.periods.length) return 'Nessun periodo di disponibilità in queste date'
  return `Disponibile ${person.periods.map(period => formatDayRange(period.startDate, period.endDate)).join(', ')}`
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
    title="Aggiungi staff alla sessione"
    description="Scegli le persone dello staff approvato e il ruolo che avranno. Le aggiungi come convocazioni da inviare: nessuna email parte adesso."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <UEmpty
        v-if="!available.length"
        icon="i-lucide-users"
        title="Nessuna persona da aggiungere"
        description="Tutto lo staff approvato è già in questa sessione. Le nuove persone arrivano dalle candidature approvate."
        :actions="[
          { label: 'Vai alle candidature', to: '/admin/staff?tab=review', color: 'neutral', variant: 'outline' },
        ]"
      />
      <template v-else>
        <div class="mb-4 grid gap-3 sm:grid-cols-2">
          <UFormField label="Ruolo">
            <USelect v-model="roleFilter" :items="roleFilterItems" class="w-full" />
          </UFormField>
          <UFormField label="Disponibilità nelle date">
            <USelect v-model="coverageFilter" :items="coverageItems" class="w-full" />
          </UFormField>
        </div>

        <p v-if="!visible.length" class="py-6 text-center text-muted">
          Nessuna persona corrisponde ai filtri: prova con un altro ruolo o con qualsiasi disponibilità.
        </p>
        <ul v-else class="divide-y divide-default rounded-lg border border-default">
          <li v-for="person in visible" :key="person.userId" class="space-y-3 p-3 sm:p-4">
            <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <UCheckbox
                :model-value="Boolean(chosen[person.userId])"
                :label="fullName(person)"
                :description="describe(person)"
                class="min-w-0 flex-1 py-1"
                :ui="{ label: 'font-semibold text-highlighted', description: 'text-sm text-muted' }"
                @update:model-value="value => toggle(person, value === true)"
              />
              <StaffCoverageBadge :coverage="person.coverage" />
            </div>
            <p class="ps-6 text-sm text-muted">
              {{ periodsText(person) }}
              <span v-if="person.previousStatus" class="block">{{ PREVIOUS[person.previousStatus] }}</span>
            </p>
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
