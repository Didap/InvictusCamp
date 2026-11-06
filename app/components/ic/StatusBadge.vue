<script setup lang="ts">
import { enumMeta, type EnumName } from '#shared/utils/constants'

// A status always reads as icon + label (never colour alone). <IcStatusBadge kind="sessionStatus" :value="s.status" />
const props = withDefaults(defineProps<{ kind: EnumName; value: string; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
})
const meta = computed(() => enumMeta(props.kind, props.value))
</script>

<template>
  <UBadge
    :color="meta.color"
    variant="subtle"
    :size="size"
    :icon="meta.icon"
    :label="meta.label"
    :title="meta.description"
    class="shrink-0"
  />
</template>
