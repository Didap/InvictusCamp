<script setup lang="ts">
import { ALLERGIES, DIETS, NON_FOOD_ALLERGIES, type Choice } from '#shared/content/member-form'
import type { StaffHealthForm } from '#shared/schemas/staff'

// The health questions of the personal sheet (/staff/scheda), always in sight, with the consent: food allergies
// (with «Altro», the notes of «Informazioni utili») and diet reach the canteen of the sessions the person is
// convoked to (docs/spec.md 3.14); the allergies not to food and the other details only the camp's admins, in the
// reserved section of the person's page. The errors land under `health.*`.
const health = defineModel<StaffHealthForm>({ required: true })

const DIET_ITEMS: Choice[] = [{ value: '', label: 'Nessuna' }, ...DIETS]
</script>

<template>
  <div class="space-y-6">
    <UFormField label="Hai intolleranze o allergie alimentari?" name="health.info.allergies" hint="Facoltativo">
      <StaffChoicesWithOther
        v-model:choices="health.info.allergies"
        v-model:other="health.info.notes"
        :items="ALLERGIES"
        legend="Intolleranze o allergie alimentari"
        name="health.info.notes"
      />
    </UFormField>
    <UFormField label="Hai preferenze alimentari?" name="health.info.diet">
      <URadioGroup
        v-model="health.info.diet"
        :items="DIET_ITEMS"
        legend="Preferenze alimentari"
        orientation="horizontal"
        :ui="{ legend: 'sr-only', fieldset: 'flex-wrap gap-x-4 gap-y-2' }"
      />
    </UFormField>
    <UFormField
      label="Hai altre allergie o intolleranze non alimentari da segnalare?"
      name="health.nonFoodAllergies.allergies"
      hint="Facoltativo"
    >
      <StaffChoicesWithOther
        v-model:choices="health.nonFoodAllergies.allergies"
        v-model:other="health.nonFoodAllergies.other"
        :items="NON_FOOD_ALLERGIES"
        legend="Allergie o intolleranze non alimentari"
        name="health.nonFoodAllergies.other"
      />
    </UFormField>
    <UFormField
      label="Hai altre info da segnalare?"
      name="health.otherInfo"
      hint="Facoltativo"
      help="Per esempio daltonismo, discalculia, disgrafia: quello che ci aiuta a rendere la tua esperienza al camp più accogliente."
    >
      <UTextarea v-model="health.otherInfo" autoresize :rows="3" :maxlength="2000" class="w-full" />
    </UFormField>
    <UFormField name="health.consent">
      <UCheckbox
        v-model="health.consent"
        label="Acconsento al trattamento di questi dati per organizzare il camp"
        description="Allergie, intolleranze e le altre informazioni possono essere dati sulla salute: li usiamo solo per organizzare i pasti e la tua partecipazione al camp. Senza consenso non li salviamo."
      />
    </UFormField>
  </div>
</template>
