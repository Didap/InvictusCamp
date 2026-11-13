<script setup lang="ts">
import { ALLERGIES, DIETS, DISABILITY_CHOICES, choiceLabel } from '#shared/content/member-form'
import type { MemberHealth } from '#shared/types/families'

// The health data of one member (special category data): only inside the family's own pages and the
// reserved section of the admin record, never in lists. Disability details, then «Informazioni utili».
const props = defineProps<{ health: MemberHealth }>()

const labels = (options: Parameters<typeof choiceLabel>[0], chosen: string[] | undefined) =>
  chosen?.length ? chosen.map(value => choiceLabel(options, value)).join(', ') : null

const disability = computed(() => {
  const details = props.health.disability
  return [
    ...DISABILITY_CHOICES.map(field => ({ label: field.label, value: labels(field.options, details?.[field.key]) })),
    { label: 'Selettività alimentare', value: details?.foodSelectivity ?? null },
    { label: 'Altro da sapere', value: details?.notes ?? null },
  ]
})

const info = computed(() => {
  const value = props.health.info
  return [
    { label: 'Allergie e intolleranze', value: labels(ALLERGIES, value?.allergies) ?? 'Nessuna indicata' },
    { label: 'Preferenze alimentari', value: value?.diet ? choiceLabel(DIETS, value.diet) : 'Nessuna indicata' },
    { label: 'Altre note', value: value?.notes ?? null },
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
