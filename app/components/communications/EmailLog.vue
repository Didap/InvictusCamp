<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { EMAIL_TEMPLATE_LABELS, emailTemplateLabel } from '#shared/schemas/communications'
import type { Paginated } from '#shared/types/api'
import type { CommunicationOptions, EmailLogItem } from '#shared/types/communications'
import { formatDateTime, plural } from '#shared/utils/format'

// The email log (docs/spec.md, 3.7): every email the platform sent, automatic or written, with its
// status. Filters by type, status, recipient and session; each email opens in a slideover, with its
// content when it is not an access email.
const props = withDefaults(
  defineProps<{
    /** Only the emails of this session (the session's tab): the session filter is hidden. */
    sessionId?: string
    /** Read and write the filters in the address (the Comunicazioni page). */
    syncQuery?: boolean
    pageSize?: number
  }>(),
  { sessionId: undefined, pageSize: 25 },
)

const route = useRoute()
const router = useRouter()
const { options } = useEnums()

function initial(key: string, fallback = 'all'): string {
  const value = props.syncQuery ? route.query[key] : undefined
  return typeof value === 'string' && value ? value : fallback
}
const q = ref(initial('q', ''))
const template = ref(initial('template'))
const status = ref(initial('status'))
const session = ref(initial('sessionId'))
const days = ref(Number(initial('days', '')) || null)
const page = ref(Number(initial('page', '1')) || 1)
const search = refDebounced(q, 300)

watch([search, template, status, session, days], () => {
  page.value = 1
})
const filters = computed(() => ({
  q: search.value.trim() || undefined,
  template: template.value === 'all' ? undefined : template.value,
  status: status.value === 'all' ? undefined : status.value,
  sessionId: props.sessionId ?? (session.value === 'all' ? undefined : session.value),
  days: days.value ?? undefined,
}))
const filtered = computed(() => {
  const { q, template, status, days } = filters.value
  return Boolean(q || template || status || days || (!props.sessionId && filters.value.sessionId))
})
if (props.syncQuery) {
  watch([filters, page], ([value, current]) =>
    router.replace({ query: { ...route.query, ...value, page: current > 1 ? current : undefined } }),
  )
}
function resetFilters() {
  q.value = ''
  template.value = 'all'
  status.value = 'all'
  session.value = 'all'
  days.value = null
}

const { data, pending } = useApiFetch<Paginated<EmailLogItem>>('/api/admin/email-log', {
  query: computed(() => ({ ...filters.value, page: page.value, pageSize: props.pageSize })),
})
const { data: choices } = useApiFetch<CommunicationOptions>('/api/admin/communications/options', {
  immediate: !props.sessionId,
})

const templateItems = [
  { value: 'all', label: 'Tutti i tipi' },
  ...Object.entries(EMAIL_TEMPLATE_LABELS).map(([value, label]) => ({ value, label })),
]
const statusItems = [{ value: 'all', label: 'Tutti gli esiti' }, ...options('emailStatus')]
const sessionItems = computed(() => [
  { value: 'all', label: 'Tutte le sessioni' },
  ...(choices.value?.sessions ?? []).map(s => ({ value: s.id, label: s.title })),
])

const selected = ref<string | null>(null)
const slideoverOpen = ref(false)
function show(email: EmailLogItem) {
  selected.value = email.id
  slideoverOpen.value = true
}

const columns: TableColumn<EmailLogItem>[] = [
  { accessorKey: 'createdAt', header: 'Data' },
  { id: 'recipient', header: 'Destinatario' },
  { id: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Esito' },
  { id: 'open', header: () => h('span', { class: 'sr-only' }, 'Dettagli') },
]
</script>

<template>
  <div>
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <UInput
        v-model="q"
        icon="i-lucide-search"
        placeholder="Cerca destinatario o oggetto"
        aria-label="Cerca nel registro"
        class="w-full sm:w-72"
      />
      <USelect v-model="template" :items="templateItems" aria-label="Tipo di email" class="w-full sm:w-56" />
      <USelect v-model="status" :items="statusItems" aria-label="Esito" class="w-full sm:w-44" />
      <USelect v-if="!sessionId" v-model="session" :items="sessionItems" aria-label="Sessione" class="w-full sm:w-60" />
      <UBadge
        v-if="days"
        color="neutral"
        variant="outline"
        size="lg"
        :label="`Ultimi ${days} giorni`"
        :ui="{ base: 'gap-1 pe-1' }"
      >
        <template #trailing>
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Togli il filtro degli ultimi giorni"
            @click="days = null"
          />
        </template>
      </UBadge>
      <p class="text-sm text-muted sm:ms-auto" aria-live="polite">
        {{ plural(data?.total ?? 0, 'email', 'email') }}
      </p>
    </div>

    <UEmpty
      v-if="data && !data.items.length"
      icon="i-lucide-mail-search"
      :title="filtered ? 'Nessuna email con questi filtri' : 'Nessuna email'"
      :description="
        filtered
          ? 'Prova con un’altra ricerca o togli i filtri.'
          : sessionId
            ? 'Inviti, conferme, convocazioni e messaggi di questa sessione compariranno qui.'
            : 'Ogni email che il gestionale invia, automatica o scritta da te, compare qui.'
      "
      :actions="
        filtered
          ? [
              {
                label: 'Togli i filtri',
                icon: 'i-lucide-x',
                color: 'neutral',
                variant: 'outline',
                onClick: resetFilters,
              },
            ]
          : []
      "
    />

    <template v-else-if="data">
      <UTable
        :data="data.items"
        :columns="columns"
        :loading="pending"
        caption="Registro delle email"
        class="hidden rounded-lg border border-default bg-elevated md:block"
        :ui="{ td: 'align-top' }"
      >
        <template #createdAt-cell="{ row }">{{ formatDateTime(row.original.createdAt) }}</template>
        <template #recipient-cell="{ row }">
          <p class="font-semibold text-highlighted">{{ row.original.toName ?? row.original.toEmail }}</p>
          <p v-if="row.original.toName">{{ row.original.toEmail }}</p>
        </template>
        <template #email-cell="{ row }">
          <div class="min-w-56 whitespace-normal">
            <p class="text-default">{{ row.original.subject }}</p>
            <p>
              {{ emailTemplateLabel(row.original.template) }}
              <template v-if="!filters.sessionId && row.original.sessionTitle"
                >· {{ row.original.sessionTitle }}</template
              >
            </p>
          </div>
        </template>
        <template #status-cell="{ row }">
          <IcStatusBadge kind="emailStatus" :value="row.original.status" />
        </template>
        <template #open-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              label="Dettagli"
              size="sm"
              color="neutral"
              variant="ghost"
              :aria-label="`Dettagli dell’email a ${row.original.toName ?? row.original.toEmail}: ${row.original.subject}`"
              @click="show(row.original)"
            />
          </div>
        </template>
      </UTable>

      <ul class="divide-y divide-default rounded-lg border border-default bg-elevated md:hidden">
        <li v-for="email in data.items" :key="email.id" class="p-4">
          <div class="flex items-start justify-between gap-3">
            <p class="min-w-0 font-semibold text-highlighted">{{ email.subject }}</p>
            <IcStatusBadge kind="emailStatus" :value="email.status" />
          </div>
          <p class="mt-1 text-sm text-muted">
            {{ emailTemplateLabel(email.template) }} · {{ formatDateTime(email.createdAt) }}
          </p>
          <p class="mt-1 truncate text-sm text-muted">A {{ email.toName ?? email.toEmail }}</p>
          <UButton
            label="Dettagli"
            color="neutral"
            variant="outline"
            class="mt-3 min-h-11"
            :aria-label="`Dettagli dell’email a ${email.toName ?? email.toEmail}: ${email.subject}`"
            @click="show(email)"
          />
        </li>
      </ul>

      <div v-if="data.total > pageSize" class="mt-5 flex justify-center">
        <UPagination v-model:page="page" :total="data.total" :items-per-page="pageSize" />
      </div>
    </template>

    <div v-else class="space-y-2" aria-busy="true">
      <USkeleton v-for="n in 4" :key="n" class="h-14 w-full" />
    </div>

    <CommunicationsEmailSlideover v-model:open="slideoverOpen" :email-id="selected" />
  </div>
</template>
