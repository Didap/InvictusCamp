<script setup lang="ts">
import type { ProgrammeBlock, ProgrammeContent, ProgrammeDay } from '#shared/types/domain'
import { formatDay } from '#shared/utils/format'
import { dayDates } from '#shared/utils/programme'

// The week, one day after the other (the same at 390px and on a desktop). `dates`: the days of the
// session, shown next to each day when the session is as long as the programme. Slots for the editor:
// `block-actions` beside each block, `day-footer` under each day.
const props = defineProps<{ content: ProgrammeContent; dates?: string[] }>()
defineSlots<{
  'block-actions'?: (props: { day: ProgrammeDay; block: ProgrammeBlock; index: number }) => unknown
  'day-footer'?: (props: { day: ProgrammeDay }) => unknown
}>()

// "21 giugno 2027 · Arrivo": the date when the days line up with the session, then the subtitle.
const captions = computed(() => {
  const dates = dayDates(props.content, props.dates)
  return props.content.days.map((day, i) =>
    [dates[i] ? formatDay(dates[i], 'long') : '', day.subtitle].filter(Boolean).join(' · '),
  )
})
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
        <li v-for="(block, index) in day.blocks" :id="`blocco-${block.id}`" :key="block.id" class="scroll-mt-24 p-4">
          <ProgrammeBlockItem :block="block">
            <template v-if="$slots['block-actions']" #actions>
              <slot name="block-actions" :day="day" :block="block" :index="index" />
            </template>
          </ProgrammeBlockItem>
        </li>
      </ul>
      <slot name="day-footer" :day="day" />
    </section>
  </div>
</template>
