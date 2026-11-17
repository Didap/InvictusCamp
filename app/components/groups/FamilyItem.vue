<script setup lang="ts">
import type { SessionGroupFamily } from '#shared/types/activity-groups'
import { memberLabel } from '#shared/utils/activity-groups'
import { PROGRAMME_GROUP_LABELS, PROGRAMME_GROUPS, type ProgrammeGroup } from '#shared/utils/constants'
import { NO_CARDS } from '#shared/utils/format'

// A family in the Gruppi tab: who it is, the young with their age, and the group it is in. The same item
// sits in the wide list of the families without a group and in the narrow group columns. The tab drags it
// (groups-card); the menu does not start a drag (groups-no-drag), nor does the link, which the browser
// would drag as a link. One root element, no comment beside it: a dragged element must be the whole item.
const props = defineProps<{ family: SessionGroupFamily; disabled: boolean; loading: boolean }>()
const emit = defineEmits<{ assign: [group: ProgrammeGroup | null] }>()

const items = PROGRAMME_GROUPS.map(group => ({ label: PROGRAMME_GROUP_LABELS[group], value: group }))
const members = computed(() =>
  props.family.members.length ? props.family.members.map(memberLabel).join(' · ') : NO_CARDS,
)
</script>

<template>
  <li
    :data-id="family.id"
    class="groups-card @container"
    :class="!disabled && 'cursor-grab select-none [-webkit-touch-callout:none] active:cursor-grabbing'"
  >
    <div class="flex flex-col gap-3 p-4 @md:flex-row @md:items-start @md:justify-between">
      <div class="min-w-0 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <ULink
            :to="`/admin/famiglie/${family.familyId}`"
            draggable="false"
            class="font-semibold text-highlighted hover:underline"
          >
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
