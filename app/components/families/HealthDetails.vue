<script setup lang="ts">
import { DISABILITY_FIELDS } from '#shared/schemas/families'
import type { MemberHealth } from '#shared/types/families'

// The health details of one member (special category data): only inside the family's own pages and
// the reserved section of the admin record, never in lists.
const props = defineProps<{ health: MemberHealth }>()

const items = computed(() =>
  DISABILITY_FIELDS.map(field => ({ label: field.label, value: props.health.disability?.[field.key] ?? null })),
)
</script>

<template>
  <div>
    <p v-if="!health.hasDisability" class="text-muted">Nessuna disabilità indicata.</p>
    <template v-else>
      <p class="mb-4 flex items-center gap-2 font-semibold text-highlighted">
        <UIcon name="i-lucide-accessibility" class="size-5 text-muted" aria-hidden="true" />
        Persona con disabilità
      </p>
      <IcDataList :items="items" :columns="2" />
    </template>
  </div>
</template>
