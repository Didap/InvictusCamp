<script setup lang="ts">
import type { ProgrammeBlock, ProgrammeContent, ProgrammeDay } from '#shared/types/domain'
import { blockTime, dayCaptions, type BlockMove } from '#shared/utils/programme'
import { DRAG_ITEM_CLASS, vDragList, type DragListOptions } from '~/utils/drag-list'

// The week of the editor as a board: one column per day, side by side once there is room (up to five
// a row; a container query: the page and the session tab are not equally wide), two or three columns
// on a tablet, one under the other on a phone. The menu of a day comes from the slot `day-actions`. A block is a card: a click or a tap opens it (`open`), a drag
// moves it within its day or to another one (v-drag-list; on touch screens after a short press, so a
// swipe still scrolls). The drop is emitted as `move` and the data moves it, Vue keeps the DOM.
// Keyboards and screen readers open and move a block from its menu (slot `block-actions`): the card
// holds no other control, since Firefox does not start a drag on a button.
const props = defineProps<{ content: ProgrammeContent; dates?: string[] }>()
const emit = defineEmits<{ move: [value: BlockMove]; open: [dayId: string, block: ProgrammeBlock | null] }>()
defineSlots<{
  'block-actions': (props: { day: ProgrammeDay; block: ProgrammeBlock; index: number }) => unknown
  'day-actions': (props: { day: ProgrammeDay; index: number }) => unknown
}>()

const captions = computed(() => dayCaptions(props.content, props.dates))
/** A weekend's three days fill the row as a week's five do. */
const columns = computed(() => `repeat(${Math.min(props.content.days.length, 5)}, minmax(0, 1fr))`)

const dragList: DragListOptions = {
  group: 'programme-week',
  draggable: '.programme-card',
  filter: '.programme-no-drag',
  onDrop: ({ from, to, oldIndex, newIndex }) =>
    emit('move', { from: from.dataset.day!, oldIndex, to: to.dataset.day!, newIndex }),
}
</script>

<template>
  <div class="@container">
    <div
      class="grid items-start gap-3 @xl:grid-cols-2 @3xl:grid-cols-3 @4xl:grid-cols-(--day-columns)"
      :style="{ '--day-columns': columns }"
    >
      <section
        v-for="(day, i) in content.days"
        :key="day.id"
        :aria-labelledby="`giorno-${day.id}`"
        class="flex min-w-0 flex-col rounded-lg bg-muted p-2"
      >
        <div class="flex items-start justify-between gap-1">
          <h2 :id="`giorno-${day.id}`" class="min-w-0 px-1 pt-1 pb-2">
            <span class="block font-bold text-highlighted">{{ day.name }}</span>
            <span v-if="captions[i]" class="block text-sm text-muted">{{ captions[i] }}</span>
          </h2>
          <div class="shrink-0">
            <slot name="day-actions" :day="day" :index="i" />
          </div>
        </div>
        <p v-if="!day.blocks.length" class="px-1 pb-2 text-sm text-muted">
          Niente in programma: trascina qui un blocco o aggiungine uno.
        </p>
        <ul
          v-drag-list="dragList"
          :data-day="day.id"
          class="flex min-h-20 flex-col gap-2 rounded-md"
          :class="!day.blocks.length && 'border border-dashed border-accented'"
        >
          <li
            v-for="(block, index) in day.blocks"
            :id="`blocco-${block.id}`"
            :key="block.id"
            class="programme-card min-w-0 scroll-mt-24 rounded-md border border-default bg-elevated p-2 hover:border-accented"
            :class="DRAG_ITEM_CLASS"
            @click="emit('open', day.id, block)"
          >
            <div class="flex items-start justify-between gap-1">
              <p class="pt-0.5 text-sm text-muted tabular-nums">{{ blockTime(block) }}</p>
              <div class="programme-no-drag -me-1 -mt-1 shrink-0" @click.stop>
                <slot name="block-actions" :day="day" :block="block" :index="index" />
              </div>
            </div>
            <ProgrammeBlockItem :block="block" compact />
          </li>
        </ul>
        <UButton
          icon="i-lucide-plus"
          label="Aggiungi"
          :aria-label="`Aggiungi un blocco a ${day.name.toLowerCase()}`"
          color="neutral"
          variant="ghost"
          class="mt-2 justify-center pointer-coarse:min-h-11"
          @click="emit('open', day.id, null)"
        />
      </section>
    </div>
  </div>
</template>
