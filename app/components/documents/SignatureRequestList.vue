<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { RemindResult, SignatureRequestRow } from '#shared/types/documents'
import { enumLabel } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDateTime, formatDay } from '#shared/utils/format'

// The requests of a document (show="person") or of an account (show="document"), for the
// administration: status, when it was asked and signed, the typed name, reminders, the signed copy.
// Desktop: a table; phones: a list. Emits `changed` after a reminder or a cancellation.
const props = defineProps<{ rows: SignatureRequestRow[]; show: 'person' | 'document' }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const confirm = useConfirm()
const busy = ref<string | null>(null)
const today = todayIso()

function who(row: SignatureRequestRow): string {
  return row.person.familyName ? `${row.person.familyName} (${row.person.name})` : row.person.name
}

async function remind(row: SignatureRequestRow) {
  const ok = await confirm({
    title: 'Inviare un promemoria?',
    description: `Partirà 1 email a ${who(row)}, ${row.person.email}, per «${row.document.title}».`,
    confirmLabel: 'Invia il promemoria',
  })
  if (!ok) return
  busy.value = row.id
  try {
    const result = await api<RemindResult>(`/api/admin/signatures/${row.id}/remind`, { method: 'POST' })
    if (result.emails) notifySuccess('Promemoria inviato', `Email inviata a ${row.person.email}.`)
    else notifySuccess('Promemoria registrato', 'Nessuna email: l’account è disattivato.')
    emit('changed')
  } catch (error) {
    notifyError(error)
  } finally {
    busy.value = null
  }
}

async function cancel(row: SignatureRequestRow) {
  const ok = await confirm({
    title: 'Annullare la richiesta?',
    description: `${who(row)} non potrà più firmare «${row.document.title}». Non parte nessuna email: se serve, avvisa tu la persona.`,
    confirmLabel: 'Annulla la richiesta',
    cancelLabel: 'Indietro',
    danger: true,
  })
  if (!ok) return
  busy.value = row.id
  try {
    await api(`/api/admin/signatures/${row.id}/cancel`, { method: 'POST' })
    notifySuccess('Richiesta annullata')
    emit('changed')
  } catch (error) {
    notifyError(error)
  } finally {
    busy.value = null
  }
}

function copyUrl(row: SignatureRequestRow, download = false): string {
  return `/api/signatures/${row.id}/copy${download ? '?download' : ''}`
}

function actions(row: SignatureRequestRow): DropdownMenuItem[] {
  if (row.status === 'pending') {
    return [
      { label: 'Invia un promemoria', icon: 'i-lucide-bell-ring', onSelect: () => remind(row) },
      { label: 'Annulla la richiesta', icon: 'i-lucide-ban', color: 'error', onSelect: () => cancel(row) },
    ]
  }
  if (row.hasSignedCopy) {
    return [
      {
        label: 'Apri la copia firmata',
        icon: 'i-lucide-external-link',
        href: copyUrl(row),
        external: true,
        target: '_blank',
      },
      { label: 'Scarica la copia firmata', icon: 'i-lucide-download', href: copyUrl(row, true), external: true },
    ]
  }
  return []
}

function signedText(row: SignatureRequestRow): string {
  if (row.status !== 'signed') return ''
  return formatDateTime(row.signedAt)
}

function dueText(row: SignatureRequestRow): string {
  if (!row.dueDate) return ''
  return `${row.status === 'pending' && row.dueDate < today ? 'Scaduta il' : 'Entro il'} ${formatDay(row.dueDate)}`
}

const columns = computed<TableColumn<SignatureRequestRow>[]>(() => [
  props.show === 'person' ? { id: 'person', header: 'Persona' } : { id: 'document', header: 'Documento' },
  { id: 'status', header: 'Stato' },
  { id: 'requested', header: 'Richiesta' },
  { id: 'signed', header: 'Firmato' },
  { id: 'reminded', header: 'Promemoria' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Azioni') },
])
</script>

<template>
  <div>
    <UTable
      :data="rows"
      :columns="columns"
      class="hidden rounded-lg border border-default bg-elevated md:block"
      :ui="{ th: 'text-sm font-semibold text-muted', td: 'align-top text-default whitespace-normal' }"
    >
      <template #person-cell="{ row }">
        <p class="font-semibold text-highlighted">{{ row.original.person.name }}</p>
        <p class="text-sm text-muted">
          {{ row.original.person.familyName ?? enumLabel('userRole', row.original.person.role) }} ·
          {{ row.original.person.email }}
        </p>
      </template>
      <template #document-cell="{ row }">
        <ULink :to="`/admin/documenti/${row.original.document.id}`" class="font-semibold text-primary hover:underline">
          {{ row.original.document.title }}
        </ULink>
        <p class="text-sm text-muted">{{ enumLabel('documentCategory', row.original.document.category) }}</p>
      </template>
      <template #status-cell="{ row }">
        <DocumentsSignatureStatusBadge
          :status="row.original.status"
          :requires-signature="row.original.document.requiresSignature"
        />
      </template>
      <template #requested-cell="{ row }">
        <p class="text-sm whitespace-nowrap tabular-nums">{{ formatDay(row.original.requestedAt.slice(0, 10)) }}</p>
        <p v-if="row.original.dueDate" class="text-sm whitespace-nowrap text-muted">{{ dueText(row.original) }}</p>
      </template>
      <template #signed-cell="{ row }">
        <template v-if="row.original.status === 'signed'">
          <p class="text-sm whitespace-nowrap tabular-nums">{{ signedText(row.original) }}</p>
          <p v-if="row.original.document.requiresSignature" class="text-sm break-words text-muted">
            come «{{ row.original.signedName }}»
          </p>
        </template>
        <span v-else class="text-sm text-dimmed">Non ancora</span>
      </template>
      <template #reminded-cell="{ row }">
        <span class="text-sm whitespace-nowrap" :class="row.original.remindedAt ? 'text-default' : 'text-dimmed'">
          {{ row.original.remindedAt ? formatDateTime(row.original.remindedAt) : 'Nessuno' }}
        </span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end">
          <UDropdownMenu v-if="actions(row.original).length" :items="actions(row.original)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :loading="busy === row.original.id"
              :aria-label="`Azioni per ${show === 'person' ? row.original.person.name : row.original.document.title}`"
            />
          </UDropdownMenu>
        </div>
      </template>
    </UTable>

    <ul class="divide-y divide-default rounded-lg border border-default bg-elevated md:hidden">
      <li v-for="row in rows" :key="row.id" class="flex items-start gap-3 p-4">
        <div class="min-w-0 flex-1 space-y-1.5">
          <template v-if="show === 'person'">
            <p class="font-semibold break-words text-highlighted">{{ row.person.name }}</p>
            <p class="text-sm break-words text-muted">
              {{ row.person.familyName ?? enumLabel('userRole', row.person.role) }} · {{ row.person.email }}
            </p>
          </template>
          <ULink v-else :to="`/admin/documenti/${row.document.id}`" class="block font-semibold text-primary">
            {{ row.document.title }}
          </ULink>
          <DocumentsSignatureStatusBadge :status="row.status" :requires-signature="row.document.requiresSignature" />
          <p class="text-sm text-muted">
            <template v-if="row.status === 'signed'">
              {{ row.document.requiresSignature ? 'Firmato' : 'Letto' }} il
              <span class="whitespace-nowrap">{{ signedText(row) }}</span
              ><template v-if="row.document.requiresSignature"> come «{{ row.signedName }}»</template>
            </template>
            <template v-else>
              Richiesta il <span class="whitespace-nowrap">{{ formatDay(row.requestedAt.slice(0, 10)) }}</span
              ><template v-if="row.dueDate"
                >, <span class="whitespace-nowrap">{{ dueText(row).toLowerCase() }}</span></template
              >
            </template>
          </p>
          <p v-if="row.remindedAt" class="text-sm text-muted">
            Promemoria il <span class="whitespace-nowrap">{{ formatDateTime(row.remindedAt) }}</span>
          </p>
        </div>
        <UDropdownMenu v-if="actions(row).length" :items="actions(row)" :content="{ align: 'end' }">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            class="size-11 justify-center"
            :loading="busy === row.id"
            :aria-label="`Azioni per ${show === 'person' ? row.person.name : row.document.title}`"
          />
        </UDropdownMenu>
      </li>
    </ul>
  </div>
</template>
