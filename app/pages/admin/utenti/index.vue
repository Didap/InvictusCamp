<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { USER_LIST_SORTS, type UserListSort } from '#shared/schemas/users'
import type { Paginated } from '#shared/types/api'
import type { UserListItem } from '#shared/types/users'
import { formatDateTime, fullName, plural } from '#shared/utils/format'

// Every account (docs/spec.md, 3.1): search, filter by role and status, sort by name, role, status or
// last sign-in (on the server: the list comes a page at a time), invite a person, send the invitation
// again, send a password link, disable and enable (never your own account).
const PAGE_SIZE = 25
const route = useRoute()
const router = useRouter()
const api = useApi()
const confirm = useConfirm()
const { options } = useEnums()
const { user: me } = useUserSession()

const fromQuery = (value: unknown, fallback = 'all') => (typeof value === 'string' && value ? value : fallback)
const q = ref(fromQuery(route.query.q, ''))
const role = ref(fromQuery(route.query.role))
const status = ref(fromQuery(route.query.status))
const page = ref(Number(route.query.page) || 1)
const sort = ref<UserListSort>(USER_LIST_SORTS.find(value => value === route.query.sort) ?? ('name' as const))
const order = ref<'asc' | 'desc'>(route.query.order === 'desc' ? 'desc' : 'asc')
const search = refDebounced(q, 300)

watch([search, role, status, sort, order], () => {
  page.value = 1
})
const query = computed(() => ({
  q: search.value.trim() || undefined,
  role: role.value === 'all' ? undefined : role.value,
  status: status.value === 'all' ? undefined : status.value,
  sort: sort.value === 'name' && order.value === 'asc' ? undefined : sort.value,
  order: sort.value === 'name' && order.value === 'asc' ? undefined : order.value,
  page: page.value > 1 ? page.value : undefined,
}))
watch(query, value => router.replace({ query: value }))

const { data, pending, refresh } = await useApiFetch<Paginated<UserListItem>>('/api/admin/users', {
  query: computed(() => ({ ...query.value, pageSize: PAGE_SIZE })),
})
const filtered = computed(() => Boolean(query.value.q || query.value.role || query.value.status))
function resetFilters() {
  q.value = ''
  role.value = 'all'
  status.value = 'all'
}

const roleItems = [{ value: 'all', label: 'Tutti i ruoli' }, ...options('userRole')]
const statusItems = [{ value: 'all', label: 'Tutti gli stati' }, ...options('userStatus')]

const inviteOpen = ref(false)

/** A line under the status that says what is pending. */
function statusNote(user: UserListItem): { text: string; warning?: boolean } | null {
  if (user.status === 'invited') {
    return user.inviteExpiresAt
      ? { text: `Invito valido fino al ${formatDateTime(user.inviteExpiresAt)}` }
      : { text: 'Invito scaduto', warning: true }
  }
  if (user.status === 'active' && !user.emailVerified) return { text: 'Indirizzo da confermare', warning: true }
  return null
}

/** POST to one of the account actions, then refresh the list. */
async function run(action: string, success: string, description?: string) {
  try {
    await api<unknown>(action, { method: 'POST' })
    notifySuccess(success, description)
    await refresh()
  } catch (error) {
    notifyError(error)
  }
}

async function resendInvite(user: UserListItem) {
  const ok = await confirm({
    title: 'Invii di nuovo l’invito?',
    description: `Partirà 1 email a ${user.email} con un nuovo link per scegliere la password, valido 7 giorni. Il link precedente smette di funzionare.`,
    confirmLabel: 'Invia l’invito',
  })
  if (ok) await run(`/api/admin/users/${user.id}/invite`, 'Invito inviato', user.email)
}

async function sendReset(user: UserListItem) {
  const ok = await confirm({
    title: 'Invii il link per la password?',
    description: `Partirà 1 email a ${user.email} con il link per scegliere una nuova password, valido un’ora. Finché non la cambia, la password attuale resta valida.`,
    confirmLabel: 'Invia il link',
  })
  if (ok) {
    await run(`/api/admin/users/${user.id}/password-reset`, 'Link inviato', user.email)
  }
}

async function disable(user: UserListItem) {
  const ok = await confirm({
    title: `Disattivi l’account di ${fullName(user)}?`,
    description:
      'Non potrà più accedere e le sessioni aperte si chiudono. I dati restano e puoi riattivarlo quando vuoi. Non parte nessuna email.',
    confirmLabel: 'Disattiva',
    danger: true,
  })
  if (ok) await run(`/api/admin/users/${user.id}/disable`, 'Account disattivato')
}

async function enable(user: UserListItem) {
  await run(`/api/admin/users/${user.id}/enable`, 'Account riattivato', `${fullName(user)} può di nuovo accedere.`)
}

function actionsFor(user: UserListItem): DropdownMenuItem[][] {
  const open: DropdownMenuItem[] = []
  if (user.role === 'family' && user.familyId) {
    open.push({
      label: 'Apri la scheda della famiglia',
      icon: 'i-lucide-heart-handshake',
      to: `/admin/famiglie/${user.familyId}`,
    })
  }
  if (user.role === 'staff') {
    open.push({ label: 'Apri la scheda dello staff', icon: 'i-lucide-id-card', to: `/admin/staff/${user.id}` })
  }
  if (user.status === 'active') {
    open.push({
      label: 'Scrivi un messaggio',
      icon: 'i-lucide-mail',
      to: `/admin/comunicazioni/nuova?userIds=${user.id}`,
    })
  }
  const access: DropdownMenuItem[] = []
  if (user.status === 'invited') {
    access.push({ label: 'Invia di nuovo l’invito', icon: 'i-lucide-mail-plus', onSelect: () => resendInvite(user) })
  }
  if (user.status === 'active') {
    access.push({ label: 'Invia il link per la password', icon: 'i-lucide-key-round', onSelect: () => sendReset(user) })
  }
  const state: DropdownMenuItem[] = []
  if (user.id !== me.value?.id) {
    state.push(
      user.status === 'disabled'
        ? { label: 'Riattiva l’account', icon: 'i-lucide-rotate-ccw', onSelect: () => enable(user) }
        : { label: 'Disattiva l’account', icon: 'i-lucide-ban', color: 'error', onSelect: () => disable(user) },
    )
  }
  return [open, access, state].filter(group => group.length)
}

const UButton = resolveComponent('UButton')

/** A column header that sorts the whole list (like /admin/famiglie): a second click reverses it. */
function sortHeader(label: string, key: UserListSort) {
  return () => {
    const active = sort.value === key
    const next = active && order.value === 'asc' ? 'desc' : 'asc'
    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label,
      trailingIcon: active
        ? order.value === 'asc'
          ? 'i-lucide-arrow-up'
          : 'i-lucide-arrow-down'
        : 'i-lucide-arrow-up-down',
      class: '-mx-2.5 font-semibold',
      'aria-label': `${label}: ordina in ordine ${next === 'asc' ? 'crescente' : 'decrescente'}`,
      onClick: () => {
        sort.value = key
        order.value = next
      },
    })
  }
}

const columns: TableColumn<UserListItem>[] = [
  { id: 'person', header: sortHeader('Persona', 'name') },
  { accessorKey: 'role', header: sortHeader('Ruolo', 'role') },
  { accessorKey: 'status', header: sortHeader('Stato', 'status') },
  { accessorKey: 'lastLoginAt', header: sortHeader('Ultimo accesso', 'lastLogin') },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Azioni') },
]
</script>

<template>
  <IcPage title="Utenti" width="wide">
    <template #actions>
      <UButton icon="i-lucide-user-plus" label="Invita una persona" @click="inviteOpen = true" />
    </template>

    <div class="mb-5 flex flex-wrap items-center gap-3">
      <UInput
        v-model="q"
        icon="i-lucide-search"
        placeholder="Cerca per nome, email o famiglia"
        aria-label="Cerca un account"
        class="w-full sm:w-80"
      />
      <USelect v-model="role" :items="roleItems" aria-label="Ruolo" class="w-full sm:w-48" />
      <USelect v-model="status" :items="statusItems" aria-label="Stato" class="w-full sm:w-48" />
      <p class="text-sm text-muted sm:ms-auto" aria-live="polite">
        {{ plural(data?.total ?? 0, 'account', 'account') }}
      </p>
    </div>

    <UEmpty
      v-if="data && !data.items.length"
      icon="i-lucide-users-round"
      :title="filtered ? 'Nessun account trovato' : 'Ancora nessun account'"
      :description="
        filtered
          ? 'Prova con un’altra ricerca o togli i filtri.'
          : 'Invita le persone che devono entrare nel gestionale: riceveranno il link per scegliere la password.'
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
          : [{ label: 'Invita una persona', icon: 'i-lucide-user-plus', onClick: () => (inviteOpen = true) }]
      "
    />

    <template v-else-if="data">
      <UTable
        :data="data.items"
        :columns="columns"
        :loading="pending"
        caption="Account del gestionale"
        class="hidden rounded-lg border border-default bg-elevated md:block"
        :ui="{ td: 'whitespace-normal align-top' }"
      >
        <template #person-cell="{ row }">
          <p class="font-semibold text-highlighted">
            {{ fullName(row.original) }}
            <span v-if="row.original.id === me?.id" class="font-normal text-muted">(tu)</span>
          </p>
          <p class="text-muted">{{ row.original.email }}</p>
          <p v-if="row.original.familyName" class="text-muted">{{ row.original.familyName }}</p>
        </template>
        <template #role-cell="{ row }">
          <IcStatusBadge kind="userRole" :value="row.original.role" />
        </template>
        <template #status-cell="{ row }">
          <IcStatusBadge kind="userStatus" :value="row.original.status" />
          <p
            v-if="statusNote(row.original)"
            class="mt-1"
            :class="statusNote(row.original)?.warning ? 'text-warning' : 'text-muted'"
          >
            {{ statusNote(row.original)?.text }}
          </p>
        </template>
        <template #lastLoginAt-cell="{ row }">
          {{ row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : 'Mai' }}
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="actionsFor(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                :aria-label="`Azioni per ${fullName(row.original)}`"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UTable>

      <ul class="divide-y divide-default rounded-lg border border-default bg-elevated md:hidden">
        <li v-for="user in data.items" :key="user.id" class="flex items-start gap-3 p-4">
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-highlighted">
              {{ fullName(user) }}
              <span v-if="user.id === me?.id" class="font-normal text-muted">(tu)</span>
            </p>
            <p class="truncate text-sm text-muted">{{ user.email }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <IcStatusBadge kind="userRole" :value="user.role" />
              <IcStatusBadge kind="userStatus" :value="user.status" />
            </div>
            <p
              v-if="statusNote(user)"
              class="mt-1 text-sm"
              :class="statusNote(user)?.warning ? 'text-warning' : 'text-muted'"
            >
              {{ statusNote(user)?.text }}
            </p>
            <p class="mt-1 text-sm text-muted">
              Ultimo accesso: {{ user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'mai' }}
            </p>
          </div>
          <UDropdownMenu :items="actionsFor(user)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              class="size-11 justify-center"
              :aria-label="`Azioni per ${fullName(user)}`"
            />
          </UDropdownMenu>
        </li>
      </ul>

      <div v-if="data.total > PAGE_SIZE" class="mt-5 flex justify-center">
        <UPagination v-model:page="page" :total="data.total" :items-per-page="PAGE_SIZE" />
      </div>
    </template>

    <UsersInviteModal v-model:open="inviteOpen" @invited="refresh" />
  </IcPage>
</template>
