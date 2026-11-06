<script setup lang="ts">
// A ratio against a limit (places of a session, staff needed) as a thin segmented bar: the confirmed
// part solid, the part still in progress lighter, the rest on a track of the same blue (dataviz:
// meter and thin segmented bar). The words carry every number; the legend under the bar names each
// segment with its swatch, so colour is never the only signal. The bar itself is hidden from
// screen readers: it repeats what the text says.
const props = defineProps<{
  label: string
  /** "3 confermate su 6 posti". */
  summary: string
  max: number
  confirmed: { value: number; label: string }
  pending?: { value: number; label: string }
  /** What the rest of the bar means, e.g. "1 posto libero" (omitted when nothing is left). */
  rest?: string
  /** The list behind the number. */
  to?: string
}>()

const share = (value: number) => (props.max > 0 ? Math.min(100, Math.max(0, (value / props.max) * 100)) : 0)
const solid = computed(() => share(props.confirmed.value))
const light = computed(() => Math.min(100 - solid.value, share(props.pending?.value ?? 0)))
const empty = computed(() => Math.max(0, 100 - solid.value - light.value))
</script>

<template>
  <div class="min-w-0">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3">
      <p class="text-sm font-semibold text-muted">{{ label }}</p>
      <ULink v-if="to" :to="to" class="font-semibold text-highlighted underline-offset-2 hover:underline">
        {{ summary }}<span class="sr-only">: {{ label }}</span>
      </ULink>
      <p v-else class="font-semibold text-highlighted">{{ summary }}</p>
    </div>
    <div class="mt-2 flex h-2 w-full gap-0.5" aria-hidden="true">
      <div
        v-if="solid > 0"
        class="h-full rounded-full bg-primary"
        :style="{ width: `${solid}%` }"
        :title="confirmed.label"
      />
      <div
        v-if="light > 0"
        class="h-full rounded-full bg-primary/45"
        :style="{ width: `${light}%` }"
        :title="pending?.label"
      />
      <div v-if="empty > 0" class="h-full flex-1 rounded-full bg-primary/15" :title="rest" />
    </div>
    <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      <li class="flex items-center gap-1.5">
        <span class="size-2.5 shrink-0 rounded-sm bg-primary" aria-hidden="true" />
        {{ confirmed.label }}
      </li>
      <li v-if="pending && pending.value > 0" class="flex items-center gap-1.5">
        <span class="size-2.5 shrink-0 rounded-sm bg-primary/45" aria-hidden="true" />
        {{ pending.label }}
      </li>
      <li v-if="rest" class="flex items-center gap-1.5">
        <span class="size-2.5 shrink-0 rounded-sm bg-primary/15" aria-hidden="true" />
        {{ rest }}
      </li>
      <slot />
    </ul>
  </div>
</template>
