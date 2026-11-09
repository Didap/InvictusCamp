<script setup lang="ts">
// The consent to health data (GDPR art. 9) as the family ticks it, with the link to the privacy notice:
// on Componenti (HealthConsent) and in the family data form, next to a young person with a condition.
const accepted = defineModel<boolean>({ default: false })
</script>

<template>
  <UCheckbox
    v-model="accepted"
    label="Acconsento al trattamento dei dati sulla salute dei componenti della mia famiglia"
  >
    <template #description>
      Come descritto
      <ULink to="/privacy" target="_blank" class="font-semibold text-primary underline">nell’informativa privacy</ULink
      >.
    </template>
  </UCheckbox>
</template>
