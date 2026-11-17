<script setup lang="ts">
import type { FamilyFormDto } from '#shared/types/families'

// The questionnaire «Dati della famiglia» (docs/spec.md 3.8): the questions every family answers on
// /famiglia/profilo, after the residence and the composition. The editor is FamiliesFormEditor.
const { data: form, error } = await useApiFetch<FamilyFormDto>('/api/admin/family-form')
</script>

<template>
  <IcPage
    title="Modulo «Dati della famiglia»"
    description="Le domande che ogni famiglia compila prima di partecipare al camp."
    back="/admin/famiglie"
  >
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Modulo non caricato"
      :description="apiErrorMessage(error)"
    />
    <FamiliesFormEditor v-else-if="form" :form="form" @saved="form = $event" />
  </IcPage>
</template>
