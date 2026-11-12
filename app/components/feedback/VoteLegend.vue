<script setup lang="ts">
import { VOTE_LEVELS } from '#shared/utils/feedback'
</script>

<template>
  <!-- The swatches of FeedbackVoteBar. -->
  <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
    <li v-for="level in VOTE_LEVELS" :key="level.key" class="flex items-center gap-1.5">
      <span :class="['size-2.5 shrink-0 rounded-sm', level.swatch]" aria-hidden="true" />
      {{ level.label }}
    </li>
  </ul>
</template>
