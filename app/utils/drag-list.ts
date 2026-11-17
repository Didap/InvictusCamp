import type Sortable from 'sortablejs'
import type { Directive } from 'vue'

/** An element dragged from one list to another, or to another place in its list. */
export interface ListDrop {
  item: HTMLElement
  from: HTMLElement
  to: HTMLElement
  oldIndex: number
  /** Counted after the element left its place. */
  newIndex: number
}

/** What `v-drag-list` takes: the lists sharing a `group` name exchange elements. */
export interface DragListOptions extends Pick<
  Sortable.Options,
  'group' | 'draggable' | 'filter' | 'sort' | 'revertOnSpill'
> {
  disabled?: boolean
  onDrop: (drop: ListDrop) => void
}

/** A draggable element: the grab cursor, and no text selection or iOS menu on the long press that drags it. */
export const DRAG_ITEM_CLASS = 'cursor-grab select-none [-webkit-touch-callout:none] active:cursor-grabbing'

interface DragListState {
  options: DragListOptions
  sortable?: Sortable
  loading?: boolean
  unmounted?: boolean
}
const states = new WeakMap<HTMLElement, DragListState>()

async function create(el: HTMLElement, state: DragListState) {
  state.loading = true
  const { default: Sortable } = await import('sortablejs')
  if (state.unmounted) return
  // Where the dragged element was: the node after it, not an index, since Vue keeps anchors and comments
  // around some elements (a component with a fragment root) that an index among elements skips.
  let home: { parent: Node; next: Node | null } | null = null
  const { onDrop: _, disabled, ...options } = state.options
  state.sortable = Sortable.create(el, {
    preventOnFilter: false,
    delay: 200,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    animation: 150,
    ghostClass: 'opacity-40',
    ...options,
    disabled: !!disabled,
    onStart: ({ item }) => {
      home = { parent: item.parentNode!, next: item.nextSibling }
    },
    onEnd: ({ item, from, to, oldIndex, newIndex }) => {
      if (home) home.parent.insertBefore(item, home.next)
      home = null
      if (oldIndex === undefined || newIndex === undefined || (from === to && oldIndex === newIndex)) return
      state.options.onDrop({ item, from, to, oldIndex, newIndex })
    },
  })
}

/** SortableJS, loaded the first time the list can be dragged, follows `disabled`. */
function sync(el: HTMLElement, state: DragListState) {
  if (state.sortable) state.sortable.option('disabled', !!state.options.disabled)
  else if (!state.options.disabled && !state.loading) void create(el, state)
}

/**
 * Drag and drop on a list (SortableJS), for as long as the list is on the page: on touch screens after a
 * short press, so a swipe still scrolls. A drop puts the element back where Vue rendered it and calls
 * `onDrop`: the data moves, Vue moves the DOM.
 */
export const vDragList: Directive<HTMLElement, DragListOptions> = {
  mounted(el, { value }) {
    const state = { options: value }
    states.set(el, state)
    sync(el, state)
  },
  updated(el, { value }) {
    const state = states.get(el)
    if (!state) return
    state.options = value
    sync(el, state)
  },
  beforeUnmount(el) {
    const state = states.get(el)
    if (!state) return
    state.unmounted = true
    state.sortable?.destroy()
    states.delete(el)
  },
}
