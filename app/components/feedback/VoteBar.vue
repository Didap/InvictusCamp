<script setup lang="ts">
import type { VoteCounts } from '#shared/types/feedback'
import { voteShares, votesTotal } from '#shared/utils/feedback'
import { plural } from '#shared/utils/format'

// One question (or the activities a person led) and how its votes split, as a thin segmented bar: 5 solid,
// 4 lighter, 1-3 in the warning colour so the low votes stand out (FeedbackVoteLegend names them). The
// words under the bar carry every number, so the bar is hidden from screen readers.
const props = defineProps<{ label: string; votes: VoteCounts; sub?: string; note?: string | null }>()

const total = computed(() => votesTotal(props.votes))
const shares = computed(() => voteShares(props.votes))
const width = (n: number) => `${(n / (total.value || 1)) * 100}%`
</script>

<template>
  <div class="min-w-0">
    <div class="flex items-baseline justify-between gap-3">
      <p class="min-w-0 font-semibold text-highlighted">{{ label }}</p>
      <p class="shrink-0 text-sm text-muted">{{ plural(total, 'voto', 'voti') }}</p>
    </div>
    <p v-if="sub" class="text-sm text-muted">{{ sub }}</p>
    <div class="mt-2 flex h-2 w-full gap-0.5" aria-hidden="true">
      <div v-if="votes.five" class="h-full rounded-full bg-primary" :style="{ width: width(votes.five) }" />
      <div v-if="votes.four" class="h-full rounded-full bg-primary/45" :style="{ width: width(votes.four) }" />
      <div v-if="votes.low" class="h-full rounded-full bg-warning" :style="{ width: width(votes.low) }" />
    </div>
    <p class="mt-1.5 text-sm text-muted">5: {{ shares.five }}% · 4: {{ shares.four }}% · da 1 a 3: {{ shares.low }}%</p>
    <p v-if="note" class="mt-1 text-sm text-muted">{{ note }}</p>
  </div>
</template>
