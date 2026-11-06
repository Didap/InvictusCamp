<script setup lang="ts">
import type { ContractState } from '#shared/types/staff'
import type { Tone } from '#shared/utils/constants'

// The contract that follows an accepted convocation. Nothing is shown when the session has no contract.
const props = withDefaults(defineProps<{ state: ContractState; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

const META: Record<Exclude<ContractState, 'none'>, { label: string; icon: string; color: Tone; title: string }> = {
  missing: {
    label: 'Contratto non inviato',
    icon: 'i-lucide-file',
    color: 'neutral',
    title: 'Non c’è una richiesta di firma aperta: assegna il contratto dalla scheda Documenti',
  },
  pending: {
    label: 'Contratto da firmare',
    icon: 'i-lucide-pen-line',
    color: 'warning',
    title: 'Ha ricevuto il contratto e non l’ha ancora firmato',
  },
  signed: { label: 'Contratto firmato', icon: 'i-lucide-file-check', color: 'success', title: 'Contratto firmato' },
}
const meta = computed(() => (props.state === 'none' ? null : META[props.state]))
</script>

<template>
  <UBadge
    v-if="meta"
    :color="meta.color"
    variant="subtle"
    :size="size"
    :icon="meta.icon"
    :label="meta.label"
    :title="meta.title"
    class="shrink-0"
  />
</template>
