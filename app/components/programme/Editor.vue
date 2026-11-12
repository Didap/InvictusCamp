<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { MAX_ACTIVITIES, type ProgrammeSaveInput } from '#shared/schemas/programmes'
import type { ProgrammeBlock, ProgrammeDay } from '#shared/types/domain'
import type { ProgrammeDto } from '#shared/types/programmes'
import { formatDateTime } from '#shared/utils/format'
import { copyOf, moveBlock, newBlockId, openPoints, placeBlock, sameContent } from '#shared/utils/programme'

// The week editor of the administration (docs/spec.md 3.10). Changes stay on this page until Salva,
// which sends the whole week with the revision it was loaded at: if someone saved in between, the
// server refuses (409) and nothing is overwritten. Leaving with unsaved changes asks first.
// `save` sends the week; the parent stores the programme it gets back, and the editor starts from it.
const props = defineProps<{
  programme: ProgrammeDto
  dates?: string[]
  save: (body: ProgrammeSaveInput) => Promise<void>
}>()

const confirm = useConfirm()
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

async function discard() {
  const ok = await confirm({
    title: 'Annullare le modifiche?',
    description: 'Il programma torna com’era all’ultimo salvataggio.',
    confirmLabel: 'Annulla le modifiche',
    cancelLabel: 'Continua a modificare',
    danger: true,
  })
  if (ok) draft.value = copyOf(props.programme.content)
}

async function canLeave() {
  if (!dirty.value) return true
  return confirm({
    title: 'Uscire senza salvare?',
    description: 'Le modifiche al programma non ancora salvate andranno perse.',
    confirmLabel: 'Esci senza salvare',
    cancelLabel: 'Resta qui',
    danger: true,
  })
}
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate(canLeave)
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

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
        onSelect: () => day.blocks.splice(index + 1, 0, { ...copyOf(block), id: newBlockId() }),
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

const points = computed(() => openPoints(draft.value))
function showBlock(blockId: string) {
  document.getElementById(`blocco-${blockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div>
    <!-- Negative top = the body padding of IcPage (p-4 sm:p-6 lg:p-8): the bar sits flush under the navbar. -->
    <div
      class="sticky -top-4 z-10 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-default bg-default py-3 sm:-top-6 lg:-top-8"
    >
      <p class="flex items-center gap-2 text-sm" role="status">
        <template v-if="dirty">
          <UIcon name="i-lucide-circle-dot" class="size-4 shrink-0 text-warning" aria-hidden="true" />
          Modifiche non salvate
        </template>
        <template v-else>
          <UIcon name="i-lucide-circle-check" class="size-4 shrink-0 text-success" aria-hidden="true" />
          Salvato il {{ formatDateTime(programme.updatedAt)
          }}<template v-if="programme.updatedByName"> da {{ programme.updatedByName }}</template>
        </template>
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="dirty"
          color="neutral"
          variant="outline"
          label="Annulla le modifiche"
          class="pointer-coarse:min-h-11"
          :disabled="saving"
          @click="discard"
        />
        <UButton
          icon="i-lucide-save"
          label="Salva"
          class="pointer-coarse:min-h-11"
          :disabled="!dirty"
          :loading="saving"
          @click="onSave"
        />
      </div>
    </div>

    <ProgrammeBoard :content="draft" :dates="dates" @move="moveBlock(draft, $event)" @open="openBlock">
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
  </div>
</template>
