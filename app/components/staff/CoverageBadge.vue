<script setup lang="ts">
import type { Tone } from '#shared/utils/constants'
import type { Coverage } from '#shared/utils/dates'

// How a person's availability covers the dates of a session (rangeCoverage): icon + label, never colour alone.
const props = withDefaults(defineProps<{ coverage: Coverage; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

const META: Record<Coverage, { label: string; icon: string; color: Tone; title: string }> = {
  full: {
    label: 'Tutte le date',
    icon: 'i-lucide-calendar-check',
    color: 'success',
    title: 'La sua disponibilità copre tutti i giorni della sessione',
  },
  partial: {
    label: 'Solo in parte',
    icon: 'i-lucide-calendar-range',
    color: 'warning',
    title: 'La sua disponibilità copre solo alcuni giorni della sessione',
  },
  none: {
    label: 'Non disponibile',
    icon: 'i-lucide-calendar-x',
    color: 'neutral',
    title: 'Nessun periodo di disponibilità copre queste date',
  },
}
const meta = computed(() => META[props.coverage])
</script>

<template>
  <UBadge
    :color="meta.color"
    variant="subtle"
    :size="size"
    :icon="meta.icon"
    :label="meta.label"
    :title="meta.title"
    class="shrink-0"
  />
</template>
