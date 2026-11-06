<script setup lang="ts">
import { enumMeta, type EnumName } from '#shared/utils/constants'

// A status always reads as icon + label (never colour alone). <IcStatusBadge kind="sessionStatus" :value="s.status" />
// At least 14px (lg), like every text people read (DESIGN.md, Typography): statuses are the point of each screen.
const props = withDefaults(defineProps<{ kind: EnumName; value: string; size?: 'lg' | 'xl' }>(), {
  size: 'lg',
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
