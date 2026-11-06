<script setup lang="ts">
import { it } from '@nuxt/ui/locale'
</script>

<template>
  <UApp :locale="it" :toaster="{ position: 'top-right', duration: 6000 }">
    <NuxtLoadingIndicator color="var(--ui-primary)" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
