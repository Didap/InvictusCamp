<script setup lang="ts">
// Comunicazioni (docs/spec.md, 3.7): the messages written in the dashboard, the saved templates and the
// log of every email the platform sent. The tab lives in the address (?tab=registro), so the Panoramica
// and the composer can link to it.
const route = useRoute()
const router = useRouter()

const tabs = [
  { label: 'Messaggi', value: 'messaggi', icon: 'i-lucide-mails', slot: 'messaggi' as const },
  { label: 'Modelli', value: 'modelli', icon: 'i-lucide-file-text', slot: 'modelli' as const },
  { label: 'Registro email', value: 'registro', icon: 'i-lucide-scroll-text', slot: 'registro' as const },
]
const tab = computed({
  get: () => tabs.find(item => item.value === route.query.tab)?.value ?? 'messaggi',
  set: value => router.replace({ query: value === 'messaggi' ? {} : { tab: value } }),
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
      <template #modelli>
        <CommunicationsTemplateList />
      </template>
      <template #registro>
        <CommunicationsEmailLog sync-query />
      </template>
    </UTabs>
  </IcPage>
</template>
