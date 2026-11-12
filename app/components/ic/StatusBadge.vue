<script setup lang="ts">
import { enumMeta, type EnumName, type Tone } from '#shared/utils/constants'

// A status always reads as icon + label (never colour alone). <IcStatusBadge kind="sessionStatus" :value="s.status" />
// At least 14px (lg), like every text people read (DESIGN.md, Typography): statuses are the point of each screen.
// `plain`: icon and label in the status colour, without the badge, where a badge is too heavy (a narrow column).
const props = withDefaults(defineProps<{ kind: EnumName; value: string; size?: 'lg' | 'xl'; plain?: boolean }>(), {
  size: 'lg',
})
const meta = computed(() => enumMeta(props.kind, props.value))

const PLAIN: Record<Tone, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  error: 'text-error',
  neutral: 'text-muted',
}
</script>

<template>
  <span
    v-if="plain"
    class="inline-flex items-start gap-1.5 text-sm"
    :class="PLAIN[meta.color]"
    :title="meta.description"
  >
    <UIcon :name="meta.icon" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    {{ meta.label }}
  </span>
  <UBadge
    v-else
    :color="meta.color"
    variant="subtle"
    :size="size"
    :icon="meta.icon"
    :label="meta.label"
    :title="meta.description"
    class="shrink-0"
  />
</template>
