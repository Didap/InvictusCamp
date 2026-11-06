<script setup lang="ts">
import type { MySignatureItem } from '#shared/types/documents'
import { enumLabel } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDateTime, formatDay } from '#shared/utils/format'

// CONTRACT (docs/BUILD.md): owned by A4 Documenti. The signed-in user's documents: those to sign (or to
// read) first, each with a link to /firma/:id, then the signed ones with their copy. No props. Used in
// the family and staff homes and in their Documenti pages, inside a section of the page.
const { data, status, error, refresh } = useApiFetch<MySignatureItem[]>('/api/signatures', {
  key: 'my-signatures',
  lazy: true,
})

const items = computed(() => data.value ?? [])
const pending = computed(() => items.value.filter(item => item.status === 'pending'))
const signed = computed(() => items.value.filter(item => item.status === 'signed'))
const today = todayIso()

function dueText(item: MySignatureItem): string {
  if (!item.dueDate) return ''
  if (item.dueDate < today) return `La scadenza era il ${formatDay(item.dueDate, 'long')}`
  return `${item.document.requiresSignature ? 'Da firmare' : 'Da leggere'} entro il ${formatDay(item.dueDate, 'long')}`
}
</script>

<template>
  <div>
    <div v-if="status === 'pending' && !data" class="space-y-3" aria-busy="true" aria-label="Caricamento dei documenti">
      <USkeleton v-for="i in 2" :key="i" class="h-20 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare i tuoi documenti"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <UEmpty
      v-else-if="!items.length"
      icon="i-lucide-file-check"
      title="Nessun documento da firmare"
      description="Quando l’amministrazione ti chiederà di leggere o firmare un documento, lo troverai qui e riceverai un’email."
    />

    <template v-else>
      <p v-if="!pending.length" class="flex items-center gap-2 font-semibold text-success">
        <UIcon name="i-lucide-circle-check" class="size-5 shrink-0" aria-hidden="true" />
        Non hai documenti da firmare.
      </p>
      <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated" aria-label="Da firmare">
        <li
          v-for="item in pending"
          :key="item.id"
          class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <div class="min-w-0">
            <p class="font-semibold break-words text-highlighted">{{ item.document.title }}</p>
            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
              <DocumentsSignatureStatusBadge
                :status="item.status"
                :requires-signature="item.document.requiresSignature"
                size="sm"
              />
              <span>{{ enumLabel('documentCategory', item.document.category) }}</span>
              <span v-if="item.dueDate" :class="item.dueDate < today ? 'font-semibold text-warning' : ''">
                {{ dueText(item) }}
              </span>
            </div>
          </div>
          <UButton
            :to="`/firma/${item.id}`"
            :label="item.document.requiresSignature ? 'Leggi e firma' : 'Leggi il documento'"
            trailing-icon="i-lucide-arrow-right"
            variant="subtle"
            size="lg"
            class="justify-center sm:shrink-0"
          />
        </li>
      </ul>

      <div v-if="signed.length" class="mt-8">
        <h3 class="font-bold text-highlighted">
          {{ signed.some(item => !item.document.requiresSignature) ? 'Già firmati o letti' : 'Già firmati' }}
        </h3>
        <ul class="mt-3 divide-y divide-default rounded-lg border border-default bg-elevated">
          <li
            v-for="item in signed"
            :key="item.id"
            class="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <div class="min-w-0">
              <p class="font-semibold break-words text-highlighted">{{ item.document.title }}</p>
              <p class="mt-0.5 text-sm text-muted">
                {{ item.document.requiresSignature ? 'Firmato' : 'Letto' }} il {{ formatDateTime(item.signedAt) }}
              </p>
            </div>
            <div v-if="item.document.requiresSignature" class="flex shrink-0 items-center gap-1">
              <UButton
                :href="`/api/signatures/${item.id}/copy`"
                external
                target="_blank"
                icon="i-lucide-file-check"
                color="neutral"
                variant="outline"
                label="Copia firmata"
              />
              <UButton
                :href="`/api/signatures/${item.id}/copy?download`"
                external
                icon="i-lucide-download"
                color="neutral"
                variant="ghost"
                class="pointer-coarse:size-11 pointer-coarse:justify-center"
                :aria-label="`Scarica la copia firmata di ${item.document.title}`"
              />
            </div>
            <UButton
              v-else
              :to="`/firma/${item.id}`"
              icon="i-lucide-eye"
              color="neutral"
              variant="outline"
              label="Rileggi"
              class="shrink-0 self-start sm:self-auto"
            />
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
