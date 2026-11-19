<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import {
  MAX_ACTIVITIES,
  MAX_PROGRAMME_DAYS,
  type ProgrammeDayNameValues,
  type ProgrammeSaveInput,
} from '#shared/schemas/programmes'
import type { ProgrammeBlock, ProgrammeDay } from '#shared/types/domain'
import type { ProgrammeDto } from '#shared/types/programmes'
import { copyOf, newId, sameContent } from '#shared/utils/plain'
import { moveBlock, nextDayName, openPoints, placeBlock } from '#shared/utils/programme'

// The week editor of the administration (docs/spec.md 3.10): its days (a weekend has three, named as
// the camp likes) and their blocks. Changes stay on this page until Salva,
// which sends the whole week with the revision it was loaded at: if someone saved in between, the
// server refuses (409) and nothing is overwritten. Leaving with unsaved changes asks first.
// `save` sends the week; the parent stores the programme it gets back, and the editor starts from it.
const props = defineProps<{
  programme: ProgrammeDto
  dates?: string[]
  save: (body: ProgrammeSaveInput) => Promise<void>
}>()

const toast = useToast()

const draft = ref(copyOf(props.programme.content))
watch(
  () => props.programme,
  programme => (draft.value = copyOf(programme.content)),
)
const dirty = computed(() => !sameContent(draft.value, props.programme.content))

const saving = ref(false)
async function onSave() {
  saving.value = true
  try {
    await props.save({ id: props.programme.id, revision: props.programme.revision, content: draft.value })
    notifySuccess('Programma salvato')
  } catch (error) {
    notifyError(error, 'Programma non salvato')
  } finally {
    saving.value = false
  }
}

useLeaveGuard(dirty, 'al programma')

// ─── Blocks ────────────────────────────────────────────────────────────────────────────────────────

const modalOpen = ref(false)
const editing = ref<{ dayId: string; block: ProgrammeBlock | null }>({ dayId: '', block: null })
function openBlock(dayId: string, block: ProgrammeBlock | null) {
  editing.value = { dayId, block }
  modalOpen.value = true
}

/** An edit that keeps day and start stays in place; otherwise the block goes in time order. */
function applyBlock({ dayId, block }: { dayId: string; block: ProgrammeBlock }) {
  const from = draft.value.days.find(day => day.blocks.some(other => other.id === block.id))
  const index = from ? from.blocks.findIndex(other => other.id === block.id) : -1
  if (from && from.id === dayId && from.blocks[index]!.start === block.start) {
    from.blocks[index] = block
    return
  }
  if (from) from.blocks.splice(index, 1)
  const to = draft.value.days.find(day => day.id === dayId)!
  to.blocks = placeBlock(to.blocks, block)
}

function move(day: ProgrammeDay, index: number, by: number) {
  moveBlock(draft.value, { from: day.id, oldIndex: index, to: day.id, newIndex: index + by })
}

/** The toast puts the block back in the day it left, even if the week was saved or changed since. */
function remove(day: ProgrammeDay, index: number) {
  const [block] = day.blocks.splice(index, 1)
  const dayId = day.id
  const restore = () => {
    const target = draft.value.days.find(other => other.id === dayId)
    if (!target || target.blocks.some(other => other.id === block!.id)) return
    target.blocks.splice(Math.min(index, target.blocks.length), 0, block!)
  }
  toast.add({
    title: `«${block!.title}» tolto dal programma`,
    color: 'neutral',
    actions: [
      {
        label: 'Rimetti',
        color: 'neutral',
        variant: 'outline',
        onClick: restore,
      },
    ],
  })
}

function blockItems(day: ProgrammeDay, block: ProgrammeBlock, index: number): DropdownMenuItem[][] {
  return [
    [{ label: 'Modifica', icon: 'i-lucide-pencil', onSelect: () => openBlock(day.id, block) }],
    [
      {
        label: 'Duplica',
        icon: 'i-lucide-copy',
        onSelect: () => day.blocks.splice(index + 1, 0, { ...copyOf(block), id: newId('b') }),
      },
      { label: 'Sposta su', icon: 'i-lucide-arrow-up', disabled: index === 0, onSelect: () => move(day, index, -1) },
      {
        label: 'Sposta giù',
        icon: 'i-lucide-arrow-down',
        disabled: index === day.blocks.length - 1,
        onSelect: () => move(day, index, 1),
      },
      {
        label: 'Sposta a',
        icon: 'i-lucide-calendar-days',
        children: draft.value.days
          .filter(other => other.id !== day.id)
          .map(other => ({ label: other.name, onSelect: () => applyBlock({ dayId: other.id, block }) })),
      },
    ],
    [{ label: 'Elimina', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(day, index) }],
  ]
}

// ─── Days ──────────────────────────────────────────────────────────────────────────────────────────

const dayModalOpen = ref(false)
/** The id of the day being named; null for a new one. */
const editingDayId = ref<string | null>(null)
const editingDay = computed(() => draft.value.days.find(day => day.id === editingDayId.value) ?? null)
const canAddDay = computed(() => draft.value.days.length < MAX_PROGRAMME_DAYS)
function openDay(day: ProgrammeDay | null) {
  editingDayId.value = day?.id ?? null
  dayModalOpen.value = true
}

function applyDay(values: ProgrammeDayNameValues) {
  if (editingDay.value) Object.assign(editingDay.value, values)
  else if (canAddDay.value) draft.value.days.push({ id: newId('d'), ...values, blocks: [] })
}

function moveDay(index: number, by: number) {
  const [day] = draft.value.days.splice(index, 1)
  draft.value.days.splice(index + by, 0, day!)
}

/** Like a block, a day comes back with "Rimetti", with its blocks, where it was. */
function removeDay(index: number) {
  const [day] = draft.value.days.splice(index, 1)
  const count = day!.blocks.length
  const restore = () => {
    const days = draft.value.days
    if (days.some(other => other.id === day!.id) || days.length >= MAX_PROGRAMME_DAYS) return
    days.splice(Math.min(index, days.length), 0, day!)
  }
  toast.add({
    title: `«${day!.name}» tolto dal programma`,
    description: count ? `Con ${count === 1 ? 'il suo blocco' : `i suoi ${count} blocchi`}.` : undefined,
    color: 'neutral',
    actions: [{ label: 'Rimetti', color: 'neutral', variant: 'outline', onClick: restore }],
  })
}

function dayItems(index: number): DropdownMenuItem[][] {
  const day = draft.value.days[index]!
  const last = draft.value.days.length - 1
  return [
    [{ label: 'Modifica', icon: 'i-lucide-pencil', onSelect: () => openDay(day) }],
    [
      { label: 'Sposta prima', icon: 'i-lucide-arrow-left', disabled: index === 0, onSelect: () => moveDay(index, -1) },
      {
        label: 'Sposta dopo',
        icon: 'i-lucide-arrow-right',
        disabled: index === last,
        onSelect: () => moveDay(index, 1),
      },
    ],
    [
      {
        label: 'Elimina il giorno',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: last === 0,
        onSelect: () => removeDay(index),
      },
    ],
  ]
}

const points = computed(() => openPoints(draft.value))
function showBlock(blockId: string) {
  document.getElementById(`blocco-${blockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div>
    <IcSaveBar
      :dirty="dirty"
      :saving="saving"
      :updated-at="programme.updatedAt"
      :updated-by-name="programme.updatedByName"
      discard-description="Il programma torna com’era all’ultimo salvataggio."
      @save="onSave"
      @discard="draft = copyOf(programme.content)"
    />

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-prose text-sm text-muted">
        {{ draft.days.length === 1 ? 'Un giorno' : `${draft.days.length} giorni` }}: dal menu di ogni giorno lo
        rinomini, lo sposti o lo togli.
      </p>
      <UButton
        icon="i-lucide-calendar-plus"
        label="Aggiungi un giorno"
        color="neutral"
        variant="outline"
        :disabled="!canAddDay"
        class="pointer-coarse:min-h-11"
        @click="openDay(null)"
      />
    </div>

    <ProgrammeBoard :content="draft" :dates="dates" @move="moveBlock(draft, $event)" @open="openBlock">
      <template #day-actions="{ day, index }">
        <UDropdownMenu :items="dayItems(index)" :content="{ align: 'end' }">
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`Azioni per ${day.name}`"
            class="pointer-coarse:size-11 pointer-coarse:justify-center"
          />
        </UDropdownMenu>
      </template>
      <template #block-actions="{ day, block, index }">
        <UDropdownMenu :items="blockItems(day, block, index)" :content="{ align: 'end' }">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`Azioni per «${block.title}»`"
            class="pointer-coarse:size-11 pointer-coarse:justify-center"
          />
        </UDropdownMenu>
      </template>
    </ProgrammeBoard>

    <div class="mt-10 grid gap-x-10 gap-y-2 lg:grid-cols-3">
      <IcSection title="Da controllare">
        <p v-if="!points.length" class="flex gap-1.5 text-sm text-success">
          <UIcon name="i-lucide-circle-check" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Niente da confermare e ogni gruppo ha la sua attività.
        </p>
        <ul v-else class="space-y-1 text-sm">
          <li v-for="point in points" :key="`${point.blockId}-${point.text}`">
            <ULink class="text-left underline-offset-2 hover:underline" @click="showBlock(point.blockId)">
              {{ point.text }}
            </ULink>
          </li>
        </ul>
      </IcSection>
      <IcSection title="Rotazione dei gruppi">
        <ProgrammeRotation :content="draft" />
      </IcSection>
      <IcSection
        title="Attività a rotazione"
        description="Le attività che i gruppi fanno a turno: le scegli nei blocchi a gruppi."
      >
        <UInputTags
          v-model="draft.activities"
          :max="MAX_ACTIVITIES"
          :max-length="80"
          placeholder="Aggiungi un’attività"
          aria-label="Attività a rotazione"
          class="w-full"
        />
      </IcSection>
    </div>

    <ProgrammeBlockModal
      v-model:open="modalOpen"
      :block="editing.block"
      :day-id="editing.dayId"
      :days="draft.days"
      :activities="draft.activities"
      @submit="applyBlock"
    />
    <ProgrammeDayModal
      v-model:open="dayModalOpen"
      :day="editingDay"
      :days="draft.days"
      :suggested="nextDayName(draft)"
      @submit="applyDay"
    />
  </div>
</template>
