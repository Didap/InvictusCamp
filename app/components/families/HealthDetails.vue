<script setup lang="ts">
import {
  ALLERGIES,
  DIETS,
  DISABILITY_CHOICES,
  HEALTH_LABELS,
  choiceLabel,
  type Choice,
} from '#shared/content/member-form'
import type { MemberHealth } from '#shared/types/families'
import { andList } from '#shared/utils/format'

// The health data of one member (special category data): only inside the family's own pages and the
// reserved section of the admin record, never in lists. Disability details, then «Informazioni utili».
const props = defineProps<{ health: MemberHealth }>()

const labels = (options: readonly Choice[], chosen: string[] | undefined) =>
  chosen?.length ? andList(chosen.map(value => choiceLabel(options, value))) : null

const disability = computed(() => {
  const details = props.health.disability
  return [
    ...DISABILITY_CHOICES.map(field => ({ label: field.label, value: labels(field.options, details?.[field.key]) })),
    { label: HEALTH_LABELS.foodSelectivity, value: details?.foodSelectivity ?? null },
    { label: HEALTH_LABELS.notes, value: details?.notes ?? null },
  ]
})

const info = computed(() => {
  const value = props.health.info
  return [
    { label: HEALTH_LABELS.allergies, value: labels(ALLERGIES, value?.allergies) ?? 'Nessuna indicata' },
    { label: HEALTH_LABELS.diet, value: value?.diet ? choiceLabel(DIETS, value.diet) : 'Nessuna indicata' },
    { label: HEALTH_LABELS.infoNotes, value: value?.notes ?? null },
  ]
})
</script>

<template>
  <div class="space-y-5">
    <template v-if="health.hasDisability">
      <p class="flex items-center gap-2 font-semibold text-highlighted">
        <UIcon name="i-lucide-accessibility" class="size-5 text-muted" aria-hidden="true" />
        Persona con disabilità
      </p>
      <IcDataList :items="disability" :columns="2" />
    </template>
    <IcDataList :items="info" :columns="2" />
  </div>
</template>
