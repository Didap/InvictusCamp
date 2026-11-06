<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { CommunicationDetail, CommunicationRecipient } from '#shared/types/communications'
import { EMAIL_STATUSES } from '#shared/utils/constants'
import { formatDateTime, plural } from '#shared/utils/format'

// A message sent from the dashboard: what it said, to whom, and how every email went. A draft opens
// in the composer instead.
const route = useRoute()
const { data, error } = await useApiFetch<CommunicationDetail>(() => `/api/admin/communications/${route.params.id}`)
if (data.value && !data.value.sentAt) {
  await navigateTo(`/admin/comunicazioni/nuova?bozza=${data.value.id}`, { replace: true })
}

const deliveries = computed(() =>
  EMAIL_STATUSES.flatMap(status =>
    data.value?.delivery[status] ? [{ status, count: data.value.delivery[status] }] : [],
  ),
)
const details = computed(() =>
  data.value
    ? [
        { label: 'Destinatari', value: data.value.audienceLabel },
        { label: 'Inviato il', value: formatDateTime(data.value.sentAt) },
        { label: 'Da', value: data.value.sentByName },
        ...(data.value.sessionId ? [{ label: 'Sessione', value: data.value.sessionTitle }] : []),
      ]
    : [],
)

/** The composer with these people chosen (at most 200: the composer loads their names by id). */
function writeTo(recipients: CommunicationRecipient[]) {
  const ids = [...new Set(recipients.flatMap(r => (r.userId ? [r.userId] : [])))]
  return ids.length && ids.length <= 200 ? `/admin/comunicazioni/nuova?userIds=${ids.join(',')}` : null
}
const writeAgain = computed(() => (data.value ? writeTo(data.value.recipients) : null))
const writeFailed = computed(() =>
  data.value?.delivery.failed ? writeTo(data.value.recipients.filter(r => r.status === 'failed')) : null,
)

const selected = ref<string | null>(null)
const slideoverOpen = ref(false)
function show(recipient: CommunicationRecipient) {
  selected.value = recipient.emailId
  slideoverOpen.value = true
}

const columns: TableColumn<CommunicationRecipient>[] = [
  { id: 'person', header: 'Persona' },
  { accessorKey: 'status', header: 'Esito' },
  { accessorKey: 'createdAt', header: 'Data' },
  { id: 'open', header: () => h('span', { class: 'sr-only' }, 'Dettagli') },
]
</script>

<template>
  <IcPage :title="data?.subject ?? 'Messaggio'" back="/admin/comunicazioni">
    <template v-if="data" #actions>
      <UButton
        v-if="writeFailed"
        :to="writeFailed"
        icon="i-lucide-mail-warning"
        label="Riscrivi a chi non l’ha ricevuto"
        color="neutral"
        variant="outline"
        class="hidden sm:inline-flex"
      />
      <UButton
        v-if="writeAgain"
        :to="writeAgain"
        icon="i-lucide-reply-all"
        label="Scrivi di nuovo"
        color="neutral"
        variant="outline"
      />
    </template>

    <UEmpty
      v-if="error"
      icon="i-lucide-mail-x"
      title="Messaggio non trovato"
      description="Forse il link è sbagliato o la bozza è stata eliminata."
      :actions="[{ label: 'Torna alle comunicazioni', icon: 'i-lucide-arrow-left', to: '/admin/comunicazioni' }]"
    />

    <template v-else-if="data">
      <IcSection title="Messaggio">
        <template v-if="data.sessionId" #actions>
          <UButton
            :to="`/admin/sessioni/${data.sessionId}?tab=comunicazioni`"
            label="Apri la sessione"
            trailing-icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
          />
        </template>
        <IcDataList :items="details" :columns="2" />
        <div class="mt-6 rounded-lg border border-default bg-elevated p-5 sm:p-6">
          <p class="font-semibold text-highlighted">{{ data.subject }}</p>
          <p class="mt-3 max-w-prose whitespace-pre-line break-words">{{ data.body }}</p>
        </div>
      </IcSection>

      <IcSection title="Destinatari" :description="plural(data.recipients.length, 'email', 'email')">
        <ul class="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Esito delle email">
          <li v-for="item in deliveries" :key="item.status" class="flex items-center gap-2">
            <span class="font-semibold text-highlighted">{{ item.count }}</span>
            <IcStatusBadge kind="emailStatus" :value="item.status" />
          </li>
        </ul>

        <UTable
          :data="data.recipients"
          :columns="columns"
          caption="Email del messaggio, una per destinatario"
          class="hidden rounded-lg border border-default bg-elevated md:block"
          :ui="{ td: 'align-top' }"
        >
          <template #person-cell="{ row }">
            <p class="font-semibold text-highlighted">{{ row.original.name ?? row.original.email }}</p>
            <p v-if="row.original.name">{{ row.original.email }}</p>
          </template>
          <template #status-cell="{ row }">
            <IcStatusBadge kind="emailStatus" :value="row.original.status" />
            <p v-if="row.original.error" class="mt-1 max-w-xs whitespace-normal text-error">{{ row.original.error }}</p>
          </template>
          <template #createdAt-cell="{ row }">{{ formatDateTime(row.original.createdAt) }}</template>
          <template #open-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                label="Vedi l’email"
                size="sm"
                color="neutral"
                variant="ghost"
                :aria-label="`Vedi l’email a ${row.original.name ?? row.original.email}`"
                @click="show(row.original)"
              />
            </div>
          </template>
        </UTable>

        <ul class="divide-y divide-default rounded-lg border border-default bg-elevated md:hidden">
          <li v-for="recipient in data.recipients" :key="recipient.emailId" class="p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-semibold text-highlighted">{{ recipient.name ?? recipient.email }}</p>
                <p v-if="recipient.name" class="truncate text-sm text-muted">{{ recipient.email }}</p>
              </div>
              <IcStatusBadge kind="emailStatus" :value="recipient.status" />
            </div>
            <p v-if="recipient.error" class="mt-1 text-sm text-error">{{ recipient.error }}</p>
            <UButton
              label="Vedi l’email"
              color="neutral"
              variant="outline"
              class="mt-3 min-h-11"
              :aria-label="`Vedi l’email a ${recipient.name ?? recipient.email}`"
              @click="show(recipient)"
            />
          </li>
        </ul>
      </IcSection>
    </template>

    <CommunicationsEmailSlideover v-model:open="slideoverOpen" :email-id="selected" />
  </IcPage>
</template>
