<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Informativa privacy · Invictus Camp' })
</script>

<template>
  <article>
    <h1 class="text-2xl font-bold text-highlighted">Informativa privacy</h1>
    <UAlert
      class="mt-6"
      color="warning"
      variant="subtle"
      icon="i-lucide-file-warning"
      title="Testo provvisorio"
      description="Il testo definitivo dell’informativa (titolare, finalità, basi giuridiche, conservazione, diritti) va fornito dall’amministrazione del camp prima dell’apertura al pubblico."
    />
    <div class="mt-6 space-y-4 text-default">
      <p>
        Il gestionale raccoglie i dati necessari a organizzare le sessioni di Invictus Camp: i dati di contatto, i
        componenti delle famiglie, i documenti caricati e, solo con un consenso esplicito, le informazioni sulla salute
        e sulla disabilità dei componenti.
      </p>
      <p>
        Le informazioni sulla salute sono visibili solo alla famiglia e all’amministrazione del camp. Ogni accesso alle
        azioni sensibili viene registrato.
      </p>
    </div>
    <UButton class="mt-8" to="/accedi" color="neutral" variant="outline" label="Torna all’accesso" />
  </article>
</template>
