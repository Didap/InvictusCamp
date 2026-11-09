<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { SessionFamilyItem } from '#shared/types/sessions'
import { formatDateTime } from '#shared/utils/format'

// One group of families of a session (titolari, reserves in calling order, those no longer in): a
// table on desktop, a list of rows on phones. The actions are emitted; FamiliesPanel runs them.
const props = defineProps<{
  items: SessionFamilyItem[]
  variant: 'titolari' | 'reserves' | 'gone'
  caption: string
  /** The session can still change (draft, inviting, confirmed). */
  editable: boolean
  /** The session is inviting or confirmed: invitations leave at once. */
  open: boolean
  /** A place is free: a reserve can be called. */
  canCall: boolean
  busy?: boolean
}>()
const emit = defineEmits<{
  answer: [item: SessionFamilyItem]
  resend: [item: SessionFamilyItem]
  remove: [item: SessionFamilyItem]
  call: [item: SessionFamilyItem]
  move: [item: SessionFamilyItem, delta: -1 | 1]
}>()

const actionsHeader = () => h('span', { class: 'sr-only' }, 'Azioni')
const columns = computed<TableColumn<SessionFamilyItem>[]>(() => {
  if (props.variant === 'reserves') {
    return [
      { id: 'rank', header: 'N.' },
      { id: 'family', header: 'Famiglia' },
      { id: 'status', header: 'Stato' },
      { id: 'invited', header: 'Avvisata' },
      { id: 'order', header: 'Ordine' },
      { id: 'actions', header: actionsHeader },
    ]
  }
  if (props.variant === 'gone') {
    return [
      { id: 'family', header: 'Famiglia' },
      { id: 'status', header: 'Stato' },
      { id: 'answer', header: 'Quando e perché' },
      { id: 'actions', header: actionsHeader },
    ]
  }
  return [
    { id: 'family', header: 'Famiglia' },
    { id: 'status', header: 'Stato' },
    { id: 'invited', header: 'Invito' },
    { id: 'answer', header: 'Risposta' },
    { id: 'actions', header: actionsHeader },
  ]
})

function invitedText(item: SessionFamilyItem): string {
  if (item.invitedAt) return formatDateTime(item.invitedAt)
  return item.status === 'selected' ? 'All’apertura degli inviti' : ''
}

function answerText(item: SessionFamilyItem): string {
  if (item.respondedAt) return formatDateTime(item.respondedAt)
  return item.status === 'invited' && item.kind === 'slot' ? 'In attesa' : ''
}

function canAnswer(item: SessionFamilyItem): boolean {
  return props.open && (item.status === 'invited' || (item.kind === 'slot' && item.status === 'confirmed'))
}

function actionsFor(item: SessionFamilyItem): DropdownMenuItem[][] {
  const main: DropdownMenuItem[] = []
  if (props.variant === 'reserves' && props.editable && props.canCall) {
    main.push({ label: 'Chiama questa riserva', icon: 'i-lucide-user-round-check', onSelect: () => emit('call', item) })
  }
  if (canAnswer(item)) {
    main.push({ label: 'Registra la risposta', icon: 'i-lucide-phone', onSelect: () => emit('answer', item) })
  }
  if (props.open && item.status === 'invited' && item.accountStatus !== 'disabled') {
    main.push({
      label: item.kind === 'slot' ? 'Invia di nuovo l’invito' : 'Invia di nuovo l’avviso',
      icon: 'i-lucide-send',
      onSelect: () => emit('resend', item),
    })
  }
  const groups: DropdownMenuItem[][] = main.length ? [main] : []
  groups.push([
    { label: 'Apri la scheda famiglia', icon: 'i-lucide-heart-handshake', to: `/admin/famiglie/${item.familyId}` },
    {
      label: 'Scrivi alla famiglia',
      icon: 'i-lucide-mail',
      to: { path: '/admin/comunicazioni/nuova', query: { userIds: item.userId } },
    },
  ])
  if (props.editable && props.variant !== 'gone') {
    groups.push([
      {
        label: item.kind === 'slot' ? 'Togli dalla sessione' : 'Togli dalla lista',
        icon: 'i-lucide-user-x',
        color: 'error',
        onSelect: () => emit('remove', item),
      },
    ])
  }
  return groups
}
</script>

<template>
  <div>
    <UTable
      :data="items"
      :columns="columns"
      :caption="caption"
      class="hidden rounded-lg border border-default bg-elevated md:block"
    >
      <template #rank-cell="{ row }">
        <span class="font-semibold text-highlighted tabular-nums">{{ row.index + 1 }}</span>
      </template>
      <template #family-cell="{ row }">
        <NuxtLink
          :to="`/admin/famiglie/${row.original.familyId}`"
          class="font-semibold text-highlighted hover:underline focus-visible:underline"
        >
          {{ row.original.familyName }}
        </NuxtLink>
        <p class="text-sm text-muted">{{ row.original.referent }}</p>
        <IcStatusBadge
          v-if="row.original.accountStatus === 'disabled'"
          kind="userStatus"
          value="disabled"
          class="mt-1"
        />
      </template>
      <template #status-cell="{ row }">
        <IcStatusBadge kind="participationStatus" :value="row.original.status" />
        <p v-if="variant === 'gone'" class="mt-1 text-sm text-muted">
          Era {{ row.original.kind === 'slot' ? 'titolare' : 'riserva' }}
        </p>
      </template>
      <template #invited-cell="{ row }">
        <span class="text-sm" :class="row.original.invitedAt ? 'text-default' : 'text-muted'">
          {{ invitedText(row.original) }}
        </span>
      </template>
      <template #answer-cell="{ row }">
        <span class="text-sm" :class="row.original.respondedAt ? 'text-default' : 'text-muted'">
          {{ answerText(row.original) }}
        </span>
        <p v-if="row.original.lateAnswer" class="flex items-center gap-1 text-sm font-semibold text-warning">
          <UIcon name="i-lucide-clock-alert" class="size-4 shrink-0" aria-hidden="true" />
          Dopo il termine
        </p>
        <p v-if="row.original.declineReason" class="max-w-prose text-sm text-muted">
          Motivo: {{ row.original.declineReason }}
        </p>
      </template>
      <template #order-cell="{ row }">
        <div class="flex gap-1">
          <UButton
            icon="i-lucide-arrow-up"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="row.index === 0 || !editable || busy"
            :aria-label="`Sposta su ${row.original.familyName}`"
            @click="emit('move', row.original, -1)"
          />
          <UButton
            icon="i-lucide-arrow-down"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="row.index === items.length - 1 || !editable || busy"
            :aria-label="`Sposta giù ${row.original.familyName}`"
            @click="emit('move', row.original, 1)"
          />
        </div>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end">
          <UDropdownMenu :items="actionsFor(row.original)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :aria-label="`Azioni per ${row.original.familyName}`"
            />
          </UDropdownMenu>
        </div>
      </template>
    </UTable>

    <ul
      class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-elevated md:hidden"
      :aria-label="caption"
    >
      <li v-for="(item, index) in items" :key="item.id" class="flex items-start gap-3 p-4">
        <span v-if="variant === 'reserves'" class="mt-0.5 w-5 shrink-0 font-semibold text-highlighted tabular-nums">
          {{ index + 1 }}
        </span>
        <div class="min-w-0 flex-1 space-y-1.5">
          <NuxtLink
            :to="`/admin/famiglie/${item.familyId}`"
            class="font-semibold text-highlighted hover:underline focus-visible:underline"
          >
            {{ item.familyName }}
          </NuxtLink>
          <p class="text-sm text-muted">{{ item.referent }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <IcStatusBadge kind="participationStatus" :value="item.status" />
            <IcStatusBadge v-if="item.accountStatus === 'disabled'" kind="userStatus" value="disabled" />
          </div>
          <p v-if="variant !== 'gone' && invitedText(item)" class="text-sm text-muted">
            {{ variant === 'reserves' ? 'Avvisata' : 'Invito' }}: {{ invitedText(item) }}
          </p>
          <p v-if="answerText(item)" class="text-sm text-muted">Risposta: {{ answerText(item) }}</p>
          <p v-if="item.lateAnswer" class="flex items-center gap-1 text-sm font-semibold text-warning">
            <UIcon name="i-lucide-clock-alert" class="size-4 shrink-0" aria-hidden="true" />
            Dopo il termine
          </p>
          <p v-if="item.declineReason" class="text-sm text-muted">Motivo: {{ item.declineReason }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <template v-if="variant === 'reserves'">
            <UButton
              icon="i-lucide-arrow-up"
              color="neutral"
              variant="outline"
              class="min-h-11 min-w-11 justify-center"
              :disabled="index === 0 || !editable || busy"
              :aria-label="`Sposta su ${item.familyName}`"
              @click="emit('move', item, -1)"
            />
            <UButton
              icon="i-lucide-arrow-down"
              color="neutral"
              variant="outline"
              class="min-h-11 min-w-11 justify-center"
              :disabled="index === items.length - 1 || !editable || busy"
              :aria-label="`Sposta giù ${item.familyName}`"
              @click="emit('move', item, 1)"
            />
          </template>
          <UDropdownMenu :items="actionsFor(item)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              class="min-h-11 min-w-11 justify-center"
              :aria-label="`Azioni per ${item.familyName}`"
            />
          </UDropdownMenu>
        </div>
      </li>
    </ul>
  </div>
</template>
