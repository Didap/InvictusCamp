import type Sortable from 'sortablejs'

/** An element dragged from one list to another, or to another place in its list. */
export interface ListDrop {
  item: HTMLElement
  from: HTMLElement
  to: HTMLElement
  oldIndex: number
  /** Counted after the element left its place. */
  newIndex: number
}

/**
 * Drag and drop among the `lists` of a component (SortableJS, loaded when the component mounts): on touch
 * screens after a short press, so a swipe still scrolls. A drop puts the element back where Vue rendered
 * it and calls `onDrop`: the data moves, Vue moves the DOM. The lists are taken again whenever `key`
 * changes (lists rendered or removed); `disabled` stops every drag while it is true.
 */
export function useDragLists(
  lists: () => HTMLElement[],
  options: Pick<Sortable.Options, 'group' | 'draggable' | 'filter' | 'sort' | 'revertOnSpill'> & {
    key: () => unknown
    disabled?: () => boolean
    onDrop: (drop: ListDrop) => void
  },
): void {
  const { key, disabled = () => false, onDrop, ...sortableOptions } = options
  let sortables: Sortable[] = []
  let unmounted = false
  function detach() {
    sortables.forEach(sortable => sortable.destroy())
    sortables = []
  }
  // Where the dragged element was: its node after it, not its index, since Vue may keep anchors and
  // comments around an element (a component with a fragment root) that an index among elements skips.
  let home: { parent: Node; next: Node | null } | null = null
  async function attach() {
    const { default: Sortable } = await import('sortablejs')
    if (unmounted) return
    detach()
    sortables = lists().map(list =>
      Sortable.create(list, {
        preventOnFilter: false,
        delay: 200,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        animation: 150,
        ghostClass: 'opacity-40',
        ...sortableOptions,
        disabled: disabled(),
        onStart: ({ item }) => {
          home = { parent: item.parentNode!, next: item.nextSibling }
        },
        onEnd: ({ item, from, to, oldIndex, newIndex }) => {
          if (home) home.parent.insertBefore(item, home.next)
          home = null
          if (oldIndex === undefined || newIndex === undefined || (from === to && oldIndex === newIndex)) return
          onDrop({ item, from, to, oldIndex, newIndex })
        },
      }),
    )
  }
  onMounted(attach)
  watch(key, attach, { flush: 'post' })
  watch(disabled, value => sortables.forEach(sortable => sortable.option('disabled', value)))
  onBeforeUnmount(() => {
    unmounted = true
    detach()
  })
}
