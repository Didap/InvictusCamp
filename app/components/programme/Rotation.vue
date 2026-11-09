<script setup lang="ts">
import type { ProgrammeContent } from '#shared/types/domain'
import { PROGRAMME_GROUP_LABELS } from '#shared/utils/constants'
import { groupRotation } from '#shared/utils/programme'

// What each group does across the week, in order, and where the rotation misses an activity of the
// list or repeats one (Nicola's check: every group does every activity once).
const props = defineProps<{ content: ProgrammeContent }>()
const rows = computed(() =>
  groupRotation(props.content).map(row => ({
    ...row,
    warnings: [
      { label: 'Più di una volta', items: row.repeated },
      { label: 'Mai', items: row.missing },
      { label: 'Non più in lista', items: row.unlisted },
    ].filter(warning => warning.items.length),
  })),
)
</script>

<template>
  <p v-if="!rows[0]?.turns.length" class="text-sm text-muted">Nessun blocco a gruppi, per ora.</p>
  <ul v-else class="space-y-5">
    <li v-for="row in rows" :key="row.group">
      <p class="flex items-center gap-2 font-semibold text-highlighted">
        <ProgrammeGroupDot :group="row.group" />
        {{ PROGRAMME_GROUP_LABELS[row.group] }}
      </p>
      <ol class="mt-1 space-y-0.5 text-sm">
        <li v-for="(turn, i) in row.turns" :key="i">
          <span class="text-muted">{{ turn.day }} {{ turn.time }}:</span> {{ turn.activity ?? 'da definire' }}
        </li>
      </ol>
      <p v-for="warning in row.warnings" :key="warning.label" class="mt-1 flex gap-1.5 text-sm text-warning">
        <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {{ warning.label }}: {{ warning.items.join(', ') }}
      </p>
      <p v-if="content.activities.length && !row.warnings.length" class="mt-1 flex gap-1.5 text-sm text-success">
        <UIcon name="i-lucide-circle-check" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Ogni attività una volta
      </p>
    </li>
  </ul>
</template>
