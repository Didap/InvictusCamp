<script setup lang="ts">
import type { VoteCounts } from '#shared/types/feedback'
import { VOTE_LEVELS, voteShares, votesTotal } from '#shared/utils/feedback'
import { plural } from '#shared/utils/format'

// One question (or the turns a person led) and how its votes split, as a thin segmented bar in the colours
// of VOTE_LEVELS (FeedbackVoteLegend names them; the same bar as DashboardMeter). The words under the bar
// carry every number, so the bar is hidden from screen readers.
const props = defineProps<{ label: string; votes: VoteCounts; sub?: string; note?: string | null }>()

const total = computed(() => votesTotal(props.votes))
const shares = computed(() => voteShares(props.votes))
</script>

<template>
  <div class="min-w-0">
    <div class="flex items-baseline justify-between gap-3">
      <p class="min-w-0 font-semibold text-highlighted">{{ label }}</p>
      <p class="shrink-0 text-sm text-muted">{{ plural(total, 'voto', 'voti') }}</p>
    </div>
    <p v-if="sub" class="text-sm text-muted">{{ sub }}</p>
    <div class="mt-2 flex h-2 w-full gap-0.5" aria-hidden="true">
      <template v-for="level in VOTE_LEVELS" :key="level.key">
        <div
          v-if="votes[level.key]"
          :class="['h-full rounded-full', level.swatch]"
          :style="{ width: `${(votes[level.key] / total) * 100}%` }"
        />
      </template>
    </div>
    <p class="mt-1.5 text-sm text-muted">
      {{ VOTE_LEVELS.map(level => `${level.short}: ${shares[level.key]}%`).join(' · ') }}
    </p>
    <p v-if="note" class="mt-1 text-sm text-muted">{{ note }}</p>
  </div>
</template>
