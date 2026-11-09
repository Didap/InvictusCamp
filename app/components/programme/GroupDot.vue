<script setup lang="ts">
import type { ProgrammeGroup } from '#shared/utils/constants'

// The groups are named after a colour: the dot repeats the name next to it, it never replaces it.
defineProps<{ group: ProgrammeGroup }>()
const SWATCH: Record<ProgrammeGroup, string> = { yellow: 'bg-giallo-400', red: 'bg-rosso-600', blue: 'bg-blu-600' }
</script>

<template>
  <span class="inline-block size-2.5 shrink-0 rounded-full" :class="SWATCH[group]" aria-hidden="true" />
</template>
