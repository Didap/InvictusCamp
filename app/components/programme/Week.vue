<script setup lang="ts">
import type { ProgrammeContent } from '#shared/types/domain'
import { dayCaptions } from '#shared/utils/programme'

// The week to read, one day after the other (the same at 390px and on a desktop): families, staff and
// a session whose programme is no longer edited. `dates`: the days of the session, shown next to each
// day when the session is as long as the programme. The editor shows the week as a board instead.
const props = defineProps<{ content: ProgrammeContent; dates?: string[] }>()
const captions = computed(() => dayCaptions(props.content, props.dates))
</script>

<template>
  <div class="space-y-8">
    <section v-for="(day, i) in content.days" :key="day.id" :aria-labelledby="`giorno-${day.id}`">
      <h2 :id="`giorno-${day.id}`" class="flex flex-wrap items-baseline gap-x-2 text-lg font-bold text-highlighted">
        <span>{{ day.name }}</span>
        <span v-if="captions[i]" class="font-normal text-muted">{{ captions[i] }}</span>
      </h2>
      <p v-if="!day.blocks.length" class="mt-2 text-muted">Niente in programma.</p>
      <ul v-else class="mt-3 divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="block in day.blocks" :key="block.id" class="p-4">
          <ProgrammeBlockItem :block="block" />
        </li>
      </ul>
    </section>
  </div>
</template>
