<script setup lang="ts">
import type { EmailQuotaStatus } from '#shared/types/communications'

// Comunicazioni (docs/spec.md, 3.7): today's emails against the daily limit, the messages written in the
// dashboard, the saved templates, the queue and the log of every email the platform sent. The tab lives
// in the address (?tab=registro), so the Panoramica and the composer can link to it.
const route = useRoute()
const router = useRouter()

const quota = useLiveEmailData<EmailQuotaStatus>('/api/admin/email-log/quota')

const tabs = computed(() => [
  { label: 'Messaggi', value: 'messaggi', icon: 'i-lucide-mails', slot: 'messaggi' as const },
  { label: 'Modelli', value: 'modelli', icon: 'i-lucide-file-text', slot: 'modelli' as const },
  {
    label: 'Coda',
    value: 'coda',
    icon: 'i-lucide-clock',
    slot: 'coda' as const,
    badge: quota.value?.queued || undefined,
  },
  { label: 'Registro', value: 'registro', icon: 'i-lucide-scroll-text', slot: 'registro' as const },
])
// Four tabs fit a phone only without their icons.
const tabsUi = { list: 'mb-6', trigger: 'px-2 sm:px-3', leadingIcon: 'hidden sm:block', label: 'overflow-visible' }
const tab = computed({
  get: () => tabs.value.find(item => item.value === route.query.tab)?.value ?? 'messaggi',
  set: value => router.replace({ query: value === 'messaggi' ? {} : { tab: value } }),
})
</script>

<template>
  <IcPage title="Comunicazioni" width="wide">
    <template #actions>
      <UButton to="/admin/comunicazioni/nuova" icon="i-lucide-pen-line" label="Scrivi un messaggio" />
    </template>

    <CommunicationsEmailQuota v-if="quota" :quota="quota" class="mb-6" />

    <UTabs v-model="tab" :items="tabs" variant="link" :ui="tabsUi">
      <template #messaggi>
        <CommunicationsCommunicationList />
      </template>
      <template #modelli>
        <CommunicationsTemplateList />
      </template>
      <template #coda>
        <CommunicationsEmailQueue />
      </template>
      <template #registro>
        <CommunicationsEmailLog sync-query />
      </template>
    </UTabs>
  </IcPage>
</template>
