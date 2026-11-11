<script setup lang="ts">
// Whether a person said they can come to the whole of a session (spec 3.5): icon + label, never colour alone.
const props = withDefaults(defineProps<{ available: boolean; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

const meta = computed(() =>
  props.available
    ? {
        label: 'Disponibile',
        icon: 'i-lucide-calendar-check',
        color: 'success' as const,
        title: 'Ha detto che c’è per tutta la sessione',
      }
    : {
        label: 'Senza disponibilità',
        icon: 'i-lucide-calendar-x',
        color: 'warning' as const,
        title: 'Non ha dato disponibilità per questa sessione, o l’ha tolta',
      },
)
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
