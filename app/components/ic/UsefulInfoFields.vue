<script setup lang="ts">
import { ALLERGIES, CHOICES_UI, DIET_ITEMS, HEALTH_LABELS, INLINE_CHOICES_UI } from '#shared/content/member-form'
import type { UsefulInfoForm } from '#shared/schemas/families'

// «Informazioni utili»: allergies and intolerances, one food preference, other notes. The fields of a family
// member's card; `name` prefixes the form field names (errors land there).
const info = defineModel<UsefulInfoForm>({ required: true })
defineProps<{ name: string }>()
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
        :ui="INLINE_CHOICES_UI"
      />
    </UFormField>
    <UFormField :label="HEALTH_LABELS.infoNotes" :name="`${name}.notes`" hint="Facoltativo">
      <UTextarea v-model="info.notes" autoresize :rows="2" class="w-full" />
    </UFormField>
  </div>
</template>
