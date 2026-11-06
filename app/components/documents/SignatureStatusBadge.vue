<script setup lang="ts">
import type { EnumMeta, SignatureStatus } from '#shared/utils/constants'

// The status of a request. A document to read (requiresSignature false) reads "Da leggere" / "Letto"
// instead of "Da firmare" / "Firmato"; everything else is the usual <IcStatusBadge>.
const props = withDefaults(
  defineProps<{ status: SignatureStatus; requiresSignature: boolean; size?: 'sm' | 'md' | 'lg' }>(),
  { size: 'md' },
)

const READ: Partial<Record<SignatureStatus, EnumMeta>> = {
  pending: { label: 'Da leggere', icon: 'i-lucide-eye', color: 'warning' },
  signed: { label: 'Letto', icon: 'i-lucide-book-check', color: 'success' },
}
const readMeta = computed(() => (props.requiresSignature ? undefined : READ[props.status]))
</script>

<template>
  <UBadge
    v-if="readMeta"
    :color="readMeta.color"
    variant="subtle"
    :size="size"
    :icon="readMeta.icon"
    :label="readMeta.label"
    class="shrink-0"
  />
  <IcStatusBadge v-else kind="signatureStatus" :value="status" :size="size" />
</template>
