<script setup lang="ts">
import type { SessionGroupFamily } from '#shared/types/activity-groups'
import type { ProgrammeGroup } from '#shared/utils/constants'
import { vDragList, type DragListOptions } from '~/utils/drag-list'

// A list of the Gruppi tab where a family is dropped: «Senza gruppo» (group null) or a group, in data-group
// for the tab's onDrop. `hint` shows while the list has no family, also while one is held over it.
defineProps<{
  families: SessionGroupFamily[]
  group: ProgrammeGroup | null
  hint: string
  drag: DragListOptions
  /** Nothing moves: the session is closed, or a change is saving. */
  locked: boolean
  /** The participation being saved. */
  saving: string | null
  listClass?: string
}>()
const emit = defineEmits<{ assign: [family: SessionGroupFamily, group: ProgrammeGroup | null] }>()
</script>

<template>
  <div class="group/drop relative">
    <ul
      v-drag-list="{ ...drag, disabled: locked }"
      :data-group="group ?? ''"
      class="divide-y divide-default"
      :class="listClass"
    >
      <GroupsFamilyItem
        v-for="family in families"
        :key="family.id"
        :family="family"
        :disabled="locked"
        :loading="saving === family.id"
        @assign="to => emit('assign', family, to)"
      />
    </ul>
    <p
      class="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted group-has-[li]/drop:hidden"
    >
      {{ hint }}
    </p>
  </div>
</template>
