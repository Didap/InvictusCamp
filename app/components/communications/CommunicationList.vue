<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Paginated } from '#shared/types/api'
import type { CommunicationListItem } from '#shared/types/communications'
import { formatDateTime, plural } from '#shared/utils/format'

// The messages written in the dashboard, drafts first: subject, audience, how many people, when.
const props = withDefaults(defineProps<{ sessionId?: string; pageSize?: number }>(), {
  sessionId: undefined,
  pageSize: 20,
})

const page = ref(1)
const { data, pending } = useApiFetch<Paginated<CommunicationListItem>>('/api/admin/communications', {
  query: computed(() => ({ sessionId: props.sessionId, page: page.value, pageSize: props.pageSize })),
})

const columns: TableColumn<CommunicationListItem>[] = [
  { accessorKey: 'subject', header: 'Oggetto' },
  { accessorKey: 'audienceLabel', header: 'Destinatari' },
  { accessorKey: 'sentAt', header: 'Inviata' },
  { accessorKey: 'sentByName', header: 'Da' },
]

const link = (item: CommunicationListItem) =>
  item.sentAt ? `/admin/comunicazioni/${item.id}` : `/admin/comunicazioni/nuova?bozza=${item.id}`
const people = (item: CommunicationListItem) => plural(item.recipientCount, 'persona', 'persone')
</script>

<template>
  <div>
    <UEmpty
      v-if="data && !data.total"
      icon="i-lucide-mail-plus"
      title="Ancora nessun messaggio"
      :description="
        sessionId
          ? 'Scrivi alle famiglie o allo staff di questa sessione: le email partono dal gestionale e restano nel registro.'
          : 'Scrivi a tutte le famiglie, allo staff o alle persone di una sessione: ogni email resta nel registro.'
      "
      :actions="
        sessionId ? [] : [{ label: 'Scrivi un messaggio', icon: 'i-lucide-pen-line', to: '/admin/comunicazioni/nuova' }]
      "
    />

    <template v-else-if="data">
      <UTable
        :data="data.items"
        :columns="columns"
        :loading="pending"
        caption="Messaggi inviati e bozze"
        class="hidden rounded-lg border border-default bg-elevated md:block"
        :ui="{ td: 'align-top whitespace-normal' }"
      >
        <template #subject-cell="{ row }">
          <ULink :to="link(row.original)" class="font-semibold text-highlighted hover:underline">
            {{ row.original.subject }}
          </ULink>
          <UBadge
            v-if="!row.original.sentAt"
            label="Bozza"
            icon="i-lucide-pencil-line"
            color="neutral"
            variant="subtle"
            class="ms-2"
          />
        </template>
        <template #audienceLabel-cell="{ row }">
          <p class="text-default">{{ row.original.audienceLabel }}</p>
          <p v-if="row.original.sentAt && row.original.audience.type !== 'users'">{{ people(row.original) }}</p>
        </template>
        <template #sentAt-cell="{ row }">
          <span class="whitespace-nowrap">{{
            row.original.sentAt ? formatDateTime(row.original.sentAt) : 'Non ancora'
          }}</span>
        </template>
        <template #sentByName-cell="{ row }">{{ row.original.sentByName ?? 'Non indicato' }}</template>
      </UTable>

      <ul class="divide-y divide-default rounded-lg border border-default bg-elevated md:hidden">
        <li v-for="item in data.items" :key="item.id">
          <NuxtLink
            :to="link(item)"
            class="block min-h-11 p-4 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            <span class="flex items-start justify-between gap-3">
              <span class="min-w-0 font-semibold text-highlighted">{{ item.subject }}</span>
              <UBadge v-if="!item.sentAt" label="Bozza" icon="i-lucide-pencil-line" color="neutral" variant="subtle" />
            </span>
            <span class="mt-1 block text-sm text-muted">{{ item.audienceLabel }}</span>
            <span class="mt-1 block text-sm text-muted">
              {{
                item.sentAt
                  ? [formatDateTime(item.sentAt), item.audience.type === 'users' ? null : people(item)]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Bozza non inviata'
              }}
            </span>
          </NuxtLink>
        </li>
      </ul>

      <div v-if="data.total > pageSize" class="mt-5 flex justify-center">
        <UPagination v-model:page="page" :total="data.total" :items-per-page="pageSize" />
      </div>
    </template>

    <div v-else class="space-y-2" aria-busy="true">
      <USkeleton v-for="n in 3" :key="n" class="h-14 w-full" />
    </div>
  </div>
</template>
