<script setup lang="ts">
import type { SessionGroupFamily } from '#shared/types/activity-groups'
import { membersLabel } from '#shared/utils/activity-groups'
import { PROGRAMME_GROUP_LABELS, PROGRAMME_GROUPS, type ProgrammeGroup } from '#shared/utils/constants'
import { DRAG_ITEM_CLASS } from '~/utils/drag-list'

// A family in the Gruppi tab: who it is, the young with their age, and the group it is in. The same item
// sits in the wide list of the families without a group and in the narrow group columns. The tab drags it
// (groups-card); the menu does not start a drag (groups-no-drag).
const props = defineProps<{ family: SessionGroupFamily; disabled: boolean; loading: boolean }>()
const emit = defineEmits<{ assign: [group: ProgrammeGroup | null] }>()

const items = PROGRAMME_GROUPS.map(group => ({ label: PROGRAMME_GROUP_LABELS[group], value: group }))
const members = computed(() => membersLabel(props.family.members))
</script>

<template>
  <li :data-id="family.id" class="groups-card @container" :class="!disabled && DRAG_ITEM_CLASS">
    <div class="flex flex-col gap-3 p-4 @md:flex-row @md:items-start @md:justify-between">
      <div class="min-w-0 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <ULink :to="`/admin/famiglie/${family.familyId}`" class="font-semibold text-highlighted hover:underline">
            {{ family.familyName }}
          </ULink>
          <IcStatusBadge kind="participationStatus" :value="family.status" />
        </div>
        <p class="text-sm text-muted">{{ members }}</p>
      </div>
      <USelectMenu
        :model-value="family.group ?? undefined"
        :items="items"
        value-key="value"
        placeholder="Nessun gruppo"
        :search-input="false"
        :disabled="disabled"
        :loading="loading"
        :aria-label="`Gruppo di ${family.familyName}`"
        clear
        class="groups-no-drag w-full shrink-0 @md:w-48"
        @update:model-value="value => emit('assign', (value as ProgrammeGroup | null | undefined) ?? null)"
      >
        <template v-if="family.group" #leading>
          <ProgrammeGroupDot :group="family.group" />
        </template>
        <template #item-leading="{ item }">
          <ProgrammeGroupDot :group="item.value" />
        </template>
      </USelectMenu>
    </div>
  </li>
</template>
