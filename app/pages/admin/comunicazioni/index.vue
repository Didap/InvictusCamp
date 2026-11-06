<script setup lang="ts">
// Comunicazioni (docs/spec.md, 3.7): the messages written in the dashboard and the log of every email
// the platform sent. The tab lives in the address (?tab=registro), so the Panoramica can link to it.
const route = useRoute()
const router = useRouter()

const tabs = [
  { label: 'Messaggi', value: 'messaggi', icon: 'i-lucide-mails', slot: 'messaggi' as const },
  { label: 'Registro email', value: 'registro', icon: 'i-lucide-scroll-text', slot: 'registro' as const },
]
const tab = computed({
  get: () => (route.query.tab === 'registro' ? 'registro' : 'messaggi'),
  set: value => router.replace({ query: value === 'registro' ? { tab: value } : {} }),
})
</script>

<template>
  <IcPage title="Comunicazioni" width="wide">
    <template #actions>
      <UButton to="/admin/comunicazioni/nuova" icon="i-lucide-pen-line" label="Scrivi un messaggio" />
    </template>

    <UTabs v-model="tab" :items="tabs" variant="link" :ui="{ list: 'mb-6' }">
      <template #messaggi>
        <CommunicationsCommunicationList />
      </template>
      <template #registro>
        <CommunicationsEmailLog sync-query />
      </template>
    </UTabs>
  </IcPage>
</template>
