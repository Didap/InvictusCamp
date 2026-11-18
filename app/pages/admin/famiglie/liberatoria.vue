<script setup lang="ts">
import type { ReleaseTextDto } from '#shared/types/families'

// The release every family signs (docs/spec.md 3.8): its text, which the camp writes here. The editor is
// FamiliesReleaseEditor.
const { data: release, error } = await useApiFetch<ReleaseTextDto>('/api/admin/release-text')
</script>

<template>
  <IcPage
    title="Liberatoria"
    description="Il testo che ogni famiglia firma prima di partecipare al camp."
    back="/admin/famiglie"
  >
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Liberatoria non caricata"
      :description="apiErrorMessage(error)"
    />
    <FamiliesReleaseEditor v-else-if="release" :release="release" @saved="release = $event" />
  </IcPage>
</template>
