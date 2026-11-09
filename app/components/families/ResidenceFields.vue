<script setup lang="ts">
import { ITALIAN_REGIONS, type ItalianRegion } from '#shared/utils/constants'

// The residence of a family, inside the parent's UForm (which validates it): required in the family
// data form (/famiglia/profilo), optional when the administration edits it (FamilyDataForm).
const residence = defineModel<{
  address: string
  city: string
  postalCode: string
  province: string
  region: ItalianRegion | undefined
}>({ required: true })
const props = defineProps<{ required?: boolean }>()
const hint = computed(() => (props.required ? undefined : 'Facoltativo'))
</script>

<template>
  <div class="space-y-5">
    <UFormField label="Via e numero civico" name="address" data-field="address" :required="required" :hint="hint">
      <UInput v-model="residence.address" autocomplete="street-address" class="w-full" />
    </UFormField>
    <div class="grid gap-5 sm:grid-cols-[1fr_10rem]">
      <UFormField label="Città" name="city" data-field="city" :required="required" :hint="hint">
        <UInput v-model="residence.city" autocomplete="address-level2" class="w-full" />
      </UFormField>
      <UFormField label="CAP" name="postalCode" data-field="postalCode" :required="required" :hint="hint">
        <UInput
          v-model="residence.postalCode"
          inputmode="numeric"
          maxlength="5"
          autocomplete="postal-code"
          class="w-full"
        />
      </UFormField>
    </div>
    <div class="grid gap-5 sm:grid-cols-[1fr_10rem]">
      <UFormField label="Regione" name="region" data-field="region" :required="required" :hint="hint">
        <USelect
          v-model="residence.region"
          :items="[...ITALIAN_REGIONS]"
          placeholder="Scegli"
          autocomplete="address-level1"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Provincia"
        name="province"
        data-field="province"
        hint="Facoltativo"
        help="La sigla, per esempio TA."
      >
        <UInput v-model="residence.province" maxlength="2" autocomplete="off" class="w-full uppercase" />
      </UFormField>
    </div>
  </div>
</template>
