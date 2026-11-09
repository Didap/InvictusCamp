<script setup lang="ts">
import type { SessionListItem } from '#shared/types/sessions'
import { SESSION_STATUSES, type SessionStatus } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'

// Every session: upcoming first (soonest first), then the past ones. The status filter lives in the
// query string (?stato=inviting) so a filtered list can be bookmarked and shared.
const route = useRoute()
const { options } = useEnums()

const statusItems = [
  { value: 'all', label: 'Tutti gli stati', icon: 'i-lucide-list' },
  ...options('sessionStatus').map(option => ({ value: option.value, label: option.label, icon: option.icon })),
]
const status = computed<'all' | SessionStatus>({
  get: () => {
    const value = route.query.stato
    return typeof value === 'string' && (SESSION_STATUSES as readonly string[]).includes(value)
      ? (value as SessionStatus)
      : 'all'
  },
  set: value => {
    navigateTo({ query: { ...route.query, stato: value === 'all' ? undefined : value } }, { replace: true })
  },
})

const {
  data: sessions,
  status: loading,
  error,
  refresh,
} = await useApiFetch<SessionListItem[]>('/api/admin/sessions', {
  query: { status: computed(() => (status.value === 'all' ? undefined : status.value)) },
})

const today = todayIso()
const upcoming = computed(() => (sessions.value ?? []).filter(session => session.endDate >= today))
const past = computed(() => (sessions.value ?? []).filter(session => session.endDate < today))
</script>

<template>
  <IcPage title="Sessioni" width="wide">
    <template #actions>
      <UButton to="/admin/sessioni/nuova" icon="i-lucide-plus" label="Nuova sessione" />
    </template>

    <template #toolbar>
      <div class="flex flex-wrap items-center gap-3 py-1">
        <label for="session-status-filter" class="text-sm font-semibold text-muted">Stato</label>
        <USelect id="session-status-filter" v-model="status" :items="statusItems" value-key="value" class="w-56" />
        <UButton
          v-if="status !== 'all'"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          label="Mostra tutte"
          @click="status = 'all'"
        />
      </div>
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare le sessioni"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else-if="loading !== 'pending' || sessions?.length">
      <IcSection
        title="Prossime sessioni"
        :description="
          upcoming.length ? 'Dalla più vicina. Apri una sessione per gestire famiglie, staff e documenti.' : undefined
        "
      >
        <SessionsListTable v-if="upcoming.length" :sessions="upcoming" caption="Prossime sessioni" />
        <UEmpty
          v-else-if="status === 'all'"
          icon="i-lucide-calendar-plus"
          title="Nessuna sessione in programma"
          description="Crea una sessione con le date, i posti per le famiglie e lo staff che serve. Le famiglie non ricevono nulla finché non apri gli inviti."
          :actions="[{ label: 'Nuova sessione', icon: 'i-lucide-plus', to: '/admin/sessioni/nuova' }]"
        />
        <UEmpty
          v-else
          icon="i-lucide-filter-x"
          title="Nessuna sessione in programma in questo stato"
          description="Cambia il filtro per vedere le altre sessioni."
          :actions="[{ label: 'Mostra tutte', color: 'neutral', variant: 'outline', onClick: () => (status = 'all') }]"
        />
      </IcSection>

      <IcSection v-if="past.length" title="Sessioni passate" description="Dalla più recente.">
        <SessionsListTable :sessions="past" caption="Sessioni passate" />
      </IcSection>
    </template>
  </IcPage>
</template>
