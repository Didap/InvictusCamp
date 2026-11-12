<script setup lang="ts">
import type { ProgrammeBlock } from '#shared/types/domain'
import { PROGRAMME_GROUP_LABELS, PROGRAMME_GROUPS } from '#shared/utils/constants'
import { blockTime } from '#shared/utils/programme'

// One block of the week: time, title, kind, who leads it and the notes; for `groups` blocks what each
// group does. It shows what it receives: the server already removed what a viewer must not read
// (server/domain/programmes.ts, programmeForViewer).
defineProps<{ block: ProgrammeBlock }>()
</script>

<template>
  <div class="sm:flex sm:gap-4">
    <p class="text-sm font-semibold text-highlighted tabular-nums sm:w-28 sm:shrink-0 sm:pt-0.5">
      {{ blockTime(block) }}
    </p>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p class="font-semibold text-highlighted">{{ block.title }}</p>
        <IcStatusBadge kind="programmeBlockKind" :value="block.kind" />
        <UBadge
          v-if="block.toConfirm"
          color="warning"
          variant="subtle"
          icon="i-lucide-circle-help"
          label="Da confermare"
        />
      </div>
      <p v-if="block.lead" class="mt-0.5 text-sm text-muted">Con {{ block.lead }}</p>
      <p v-if="block.note" class="mt-1 max-w-prose text-sm">{{ block.note }}</p>
      <p v-if="block.staffNote" class="mt-1 flex max-w-prose gap-1.5 text-sm text-muted">
        <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span><span class="sr-only">Nota interna: </span>{{ block.staffNote }}</span>
      </p>
      <ul v-if="block.groups" class="mt-2 grid gap-1 lg:grid-cols-3" aria-label="Le attività dei gruppi">
        <li v-for="group in PROGRAMME_GROUPS" :key="group" class="flex items-start gap-2 text-sm">
          <ProgrammeGroupDot :group="group" class="mt-1.5" />
          <span>
            <span class="font-semibold">{{ PROGRAMME_GROUP_LABELS[group] }}:</span>
            {{ block.groups[group].activity ?? 'da definire' }}
            <span v-if="block.groups[group].lead" class="text-muted">· {{ block.groups[group].lead }}</span>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
