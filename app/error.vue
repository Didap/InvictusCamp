<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
useHead({ title: () => (notFound.value ? 'Pagina non trovata · Invictus Camp' : 'Errore · Invictus Camp') })
</script>

<template>
  <UApp>
    <main class="flex min-h-dvh items-center justify-center bg-default p-6">
      <div class="max-w-md text-center">
        <IcLogo class="justify-center" :subtitle="false" />
        <h1 class="mt-10 text-2xl font-bold text-highlighted">
          {{ notFound ? 'Pagina non trovata' : 'Qualcosa non ha funzionato' }}
        </h1>
        <p class="mt-3 text-muted">
          {{
            notFound
              ? 'L’indirizzo potrebbe essere sbagliato, oppure la pagina non esiste più.'
              : 'Riprova tra qualche istante. Se il problema continua, scrivi all’amministrazione del camp.'
          }}
        </p>
        <UButton class="mt-8" size="lg" label="Torna alla home" @click="clearError({ redirect: '/' })" />
      </div>
    </main>
  </UApp>
</template>
