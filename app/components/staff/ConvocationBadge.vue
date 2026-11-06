<script setup lang="ts">
import type { ConvocationStatus } from '#shared/utils/constants'

// The status of a convocation. "Confermata" is derived (accepted and, if the session has a contract,
// signed: docs/spec.md 0), so it is not in ENUM_META: it gets the same icon + label look here.
withDefaults(defineProps<{ status: ConvocationStatus; confirmed?: boolean; size?: 'sm' | 'md' | 'lg' }>(), {
  confirmed: false,
  size: 'md',
})
</script>

<template>
  <UBadge
    v-if="confirmed"
    color="success"
    variant="subtle"
    :size="size"
    icon="i-lucide-circle-check"
    label="Confermata"
    title="Ha accettato e, se previsto, firmato il contratto"
    class="shrink-0"
  />
  <IcStatusBadge v-else kind="convocationStatus" :value="status" :size="size" />
</template>
