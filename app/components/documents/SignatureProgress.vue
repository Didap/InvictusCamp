<script setup lang="ts">
// Signed (or read) out of assigned, as a labelled bar: "Firmati 2 su 5".
const props = defineProps<{ signed: number; assigned: number; requiresSignature: boolean }>()

const label = computed(() =>
  props.assigned
    ? `${props.requiresSignature ? 'Firmati' : 'Letti'} ${props.signed} su ${props.assigned}`
    : 'Non ancora assegnato',
)
</script>

<template>
  <div class="min-w-36">
    <p class="text-sm tabular-nums" :class="assigned ? 'text-default' : 'text-muted'">{{ label }}</p>
    <UProgress
      v-if="assigned"
      :model-value="signed"
      :max="assigned"
      size="sm"
      :color="signed === assigned ? 'success' : 'primary'"
      class="mt-1.5"
      :aria-label="label"
    />
  </div>
</template>
