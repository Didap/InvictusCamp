<script setup lang="ts">
import { ALLERGIES, CHOICES_UI, DIETS, HEALTH_LABELS, type Choice } from '#shared/content/member-form'
import type { UsefulInfoForm } from '#shared/schemas/families'

// «Informazioni utili»: allergies and intolerances, one food preference, other notes. The fields of a family
// member's card and of the staff's canteen details; `name` prefixes the form field names (errors land there).
const info = defineModel<UsefulInfoForm>({ required: true })
defineProps<{ name: string }>()

const DIET_ITEMS: Choice[] = [{ value: '', label: 'Nessuna' }, ...DIETS]
</script>

<template>
  <div class="space-y-5">
    <UFormField :label="HEALTH_LABELS.allergies" :name="`${name}.allergies`" hint="Facoltativo">
      <UCheckboxGroup v-model="info.allergies" :items="ALLERGIES" :legend="HEALTH_LABELS.allergies" :ui="CHOICES_UI" />
    </UFormField>
    <UFormField :label="HEALTH_LABELS.diet" :name="`${name}.diet`">
      <URadioGroup
        v-model="info.diet"
        :items="DIET_ITEMS"
        :legend="HEALTH_LABELS.diet"
        orientation="horizontal"
        :ui="{ legend: 'sr-only', fieldset: 'flex-wrap gap-x-4 gap-y-2' }"
      />
    </UFormField>
    <UFormField :label="HEALTH_LABELS.infoNotes" :name="`${name}.notes`" hint="Facoltativo">
      <UTextarea v-model="info.notes" autoresize :rows="2" class="w-full" />
    </UFormField>
  </div>
</template>
