<script setup lang="ts">
import Sortable from 'sortablejs'
import type { ProgrammeBlock, ProgrammeContent, ProgrammeDay } from '#shared/types/domain'
import { formatDay } from '#shared/utils/format'
import { dayDates, type BlockMove } from '#shared/utils/programme'

// The week, one day after the other (the same at 390px and on a desktop). `dates`: the days of the
// session, shown next to each day when the session is as long as the programme. Slots for the editor:
// `block-actions` beside each block, `day-footer` under each day. `sortable`: each block gets a grip to
// drag it within its day or to another one (SortableJS, touch included); the drop is emitted as `move`
// and the data moves it, Vue keeps the DOM. Keyboards and a single tap move blocks from the block menu
// instead (up, down, to another day).
const props = defineProps<{ content: ProgrammeContent; dates?: string[]; sortable?: boolean }>()
const emit = defineEmits<{ move: [value: BlockMove] }>()
defineSlots<{
  'block-actions'?: (props: { day: ProgrammeDay; block: ProgrammeBlock; index: number }) => unknown
  'day-footer'?: (props: { day: ProgrammeDay }) => unknown
}>()

// "21 giugno 2027 · Arrivo": the date when the days line up with the session, then the subtitle.
const captions = computed(() => {
  const dates = dayDates(props.content, props.dates)
  return props.content.days.map((day, i) =>
    [dates[i] ? formatDay(dates[i], 'long') : '', day.subtitle].filter(Boolean).join(' · '),
  )
})

const lists = useTemplateRef<HTMLUListElement[]>('lists')
let sortables: Sortable[] = []
function detach() {
  sortables.forEach(sortable => sortable.destroy())
  sortables = []
}
// Again whenever the days change (another programme loaded): new lists need their own instance.
function attach() {
  detach()
  if (!props.sortable) return
  sortables = (lists.value ?? []).map(list =>
    Sortable.create(list, {
      group: 'programme-week',
      handle: '.programme-grip',
      draggable: 'li',
      animation: 150,
      ghostClass: 'opacity-40',
      onEnd: ({ item, from, to, oldIndex, newIndex }) => {
        if (oldIndex === undefined || newIndex === undefined || (from === to && oldIndex === newIndex)) return
        // Put the element back where Vue rendered it: the data moves the block, Vue moves the DOM.
        to.removeChild(item)
        from.insertBefore(item, from.children[oldIndex] ?? null)
        emit('move', { from: from.dataset.day!, oldIndex, to: to.dataset.day!, newIndex })
      },
    }),
  )
}
onMounted(attach)
watch(() => props.content.days.map(day => day.id).join(), attach, { flush: 'post' })
onBeforeUnmount(detach)
</script>

<template>
  <div class="space-y-8">
    <section v-for="(day, i) in content.days" :key="day.id" :aria-labelledby="`giorno-${day.id}`">
      <h2 :id="`giorno-${day.id}`" class="flex flex-wrap items-baseline gap-x-2 text-lg font-bold text-highlighted">
        <span>{{ day.name }}</span>
        <span v-if="captions[i]" class="font-normal text-muted">{{ captions[i] }}</span>
      </h2>
      <p v-if="!day.blocks.length" class="mt-2 text-muted">
        Niente in programma.<template v-if="sortable"> Trascina qui un blocco o aggiungine uno.</template>
      </p>
      <ul
        v-if="day.blocks.length || sortable"
        ref="lists"
        :data-day="day.id"
        class="mt-3 divide-y divide-default rounded-lg border border-default bg-elevated"
        :class="!day.blocks.length && 'min-h-14 border-dashed'"
      >
        <li
          v-for="(block, index) in day.blocks"
          :id="`blocco-${block.id}`"
          :key="block.id"
          class="flex scroll-mt-24 items-start gap-2 p-4"
        >
          <span
            v-if="sortable"
            class="programme-grip -ms-2 mt-0.5 flex shrink-0 cursor-grab touch-none items-center rounded p-1 text-dimmed hover:bg-muted hover:text-highlighted active:cursor-grabbing"
            title="Trascina per spostare"
            aria-hidden="true"
          >
            <UIcon name="i-lucide-grip-vertical" class="size-5" />
          </span>
          <ProgrammeBlockItem :block="block" class="min-w-0 flex-1">
            <template v-if="$slots['block-actions']" #actions>
              <slot name="block-actions" :day="day" :block="block" :index="index" />
            </template>
          </ProgrammeBlockItem>
        </li>
      </ul>
      <slot name="day-footer" :day="day" />
    </section>
  </div>
</template>
