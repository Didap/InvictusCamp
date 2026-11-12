<script setup lang="ts">
import type Sortable from 'sortablejs'
import type { ProgrammeBlock, ProgrammeContent, ProgrammeDay } from '#shared/types/domain'
import { enumMeta, PROGRAMME_GROUP_LABELS, PROGRAMME_GROUPS, type Tone } from '#shared/utils/constants'
import { blockTime, dayCaptions, type BlockMove } from '#shared/utils/programme'

// The week of the editor as a board: one column per day, side by side once there is room for five
// (a container query: the page and the session tab are not equally wide), two or three columns on a
// tablet, one under the other on a phone. A block is a card: a click or a tap opens it (`open`), a drag
// moves it within its day or to another one (SortableJS; on touch screens after a short press, so a
// swipe still scrolls). The drop is emitted as `move` and the data moves it, Vue keeps the DOM.
// Keyboards open a block from its title and move it from its menu (slot `block-actions`).
const props = defineProps<{ content: ProgrammeContent; dates?: string[] }>()
const emit = defineEmits<{ move: [value: BlockMove]; open: [dayId: string, block: ProgrammeBlock | null] }>()
defineSlots<{
  'block-actions'?: (props: { day: ProgrammeDay; block: ProgrammeBlock; index: number }) => unknown
}>()

const captions = computed(() => dayCaptions(props.content, props.dates))

// The kind of a block as icon and label in its colour: a badge is too heavy for a column this narrow.
const KIND_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  error: 'text-error',
  neutral: 'text-muted',
}
const kindOf = (block: ProgrammeBlock) => enumMeta('programmeBlockKind', block.kind)

const lists = useTemplateRef<HTMLUListElement[]>('lists')
let sortables: Sortable[] = []
function detach() {
  sortables.forEach(sortable => sortable.destroy())
  sortables = []
}
// Again whenever the days change (another programme loaded): new lists need their own instance.
async function attach() {
  const { default: Sortable } = await import('sortablejs')
  if (unmounted) return
  detach()
  sortables = (lists.value ?? []).map(list =>
    Sortable.create(list, {
      group: 'programme-week',
      draggable: 'li',
      filter: '.programme-no-drag',
      preventOnFilter: false,
      delay: 200,
      delayOnTouchOnly: true,
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
let unmounted = false
onMounted(attach)
watch(() => props.content.days.map(day => day.id).join(), attach, { flush: 'post' })
onBeforeUnmount(() => {
  unmounted = true
  detach()
})
</script>

<template>
  <div class="@container">
    <div class="grid items-start gap-3 @xl:grid-cols-2 @3xl:grid-cols-3 @4xl:grid-cols-5">
      <section
        v-for="(day, i) in content.days"
        :key="day.id"
        :aria-labelledby="`giorno-${day.id}`"
        class="flex min-w-0 flex-col rounded-lg bg-muted p-2"
      >
        <h2 :id="`giorno-${day.id}`" class="px-1 pt-1 pb-2">
          <span class="block font-bold text-highlighted">{{ day.name }}</span>
          <span v-if="captions[i]" class="block text-sm text-muted">{{ captions[i] }}</span>
        </h2>
        <p v-if="!day.blocks.length" class="px-1 pb-2 text-sm text-muted">
          Niente in programma: trascina qui un blocco o aggiungine uno.
        </p>
        <ul
          ref="lists"
          :data-day="day.id"
          class="flex min-h-20 flex-col gap-2 rounded-md"
          :class="!day.blocks.length && 'border border-dashed border-accented'"
        >
          <li
            v-for="(block, index) in day.blocks"
            :id="`blocco-${block.id}`"
            :key="block.id"
            class="min-w-0 scroll-mt-24 cursor-grab rounded-md border border-default bg-elevated p-2 hover:border-accented active:cursor-grabbing"
            @click="emit('open', day.id, block)"
          >
            <div class="flex items-start justify-between gap-1">
              <p class="pt-0.5 text-sm text-muted tabular-nums">{{ blockTime(block) }}</p>
              <div v-if="$slots['block-actions']" class="programme-no-drag -me-1 -mt-1 shrink-0" @click.stop>
                <slot name="block-actions" :day="day" :block="block" :index="index" />
              </div>
            </div>
            <button
              type="button"
              class="text-left text-sm font-semibold text-highlighted [overflow-wrap:anywhere] hover:underline focus-visible:underline"
            >
              {{ block.title }}
            </button>
            <p class="mt-1 flex items-start gap-1.5 text-sm" :class="KIND_TEXT[kindOf(block).color]">
              <UIcon :name="kindOf(block).icon" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {{ kindOf(block).label }}
            </p>
            <p v-if="block.toConfirm" class="mt-0.5 flex items-start gap-1.5 text-sm text-warning">
              <UIcon name="i-lucide-circle-help" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Da confermare
            </p>
            <p v-if="block.lead" class="mt-0.5 text-sm text-muted">Con {{ block.lead }}</p>
            <ul v-if="block.groups" class="mt-1 space-y-0.5 text-sm" aria-label="Le attività dei gruppi">
              <li v-for="group in PROGRAMME_GROUPS" :key="group" class="flex items-start gap-1.5">
                <ProgrammeGroupDot :group="group" class="mt-1.5" />
                <span class="min-w-0 [overflow-wrap:anywhere]">
                  <span class="sr-only">{{ PROGRAMME_GROUP_LABELS[group] }}: </span>
                  <span :class="!block.groups[group].activity && 'text-muted'">
                    {{ block.groups[group].activity ?? 'da definire' }}
                  </span>
                </span>
              </li>
            </ul>
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
