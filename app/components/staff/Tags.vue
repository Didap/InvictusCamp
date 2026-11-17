<script setup lang="ts">
import type { StaffTagDto } from '#shared/types/staff'

// The «Valutazione» of a person: the tags, each with its name and colour (never colour alone).
defineProps<{ tags: StaffTagDto[]; empty?: string }>()
</script>

<template>
  <ul v-if="tags.length" class="flex flex-wrap gap-1.5" aria-label="Valutazione">
    <li v-for="tag in tags" :key="tag.id">
      <UBadge :label="tag.name" :color="tag.color" variant="subtle" />
    </li>
  </ul>
  <span v-else-if="empty" class="text-dimmed">{{ empty }}</span>
</template>
