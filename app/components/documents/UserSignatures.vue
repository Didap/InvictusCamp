<script setup lang="ts">
import type { SignatureRequestRow } from '#shared/types/documents'
import { plural } from '#shared/utils/format'

// CONTRACT (docs/BUILD.md): owned by A4 Documenti. Admin family and staff pages: the documents assigned
// to one account, with status, reminder, cancellation and signed copy, and "Assegna un documento".
// Props are final. Meant to sit inside a section of the embedding page (it has no heading of its own).
const props = defineProps<{ userId: string }>()

const { data, status, error, refresh } = useApiFetch<SignatureRequestRow[]>('/api/admin/signatures', {
  query: computed(() => ({ userId: props.userId })),
  lazy: true,
})
const assignOpen = ref(false)

const rows = computed(() => data.value ?? [])
const summary = computed(() => {
  const pending = rows.value.filter(r => r.status === 'pending').length
  const signed = rows.value.filter(r => r.status === 'signed').length
  if (!pending && !signed) return 'Nessun documento in corso.'
  return [pending ? `${pending} da firmare` : '', signed ? plural(signed, 'firmato', 'firmati') : '']
    .filter(Boolean)
    .join(', ')
})
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted" aria-live="polite">{{ data ? summary : '' }}</p>
      <UButton
        icon="i-lucide-file-plus"
        color="neutral"
        variant="outline"
        label="Assegna un documento"
        @click="assignOpen = true"
      />
    </div>

    <div v-if="status === 'pending' && !data" class="space-y-2" aria-busy="true" aria-label="Caricamento delle firme">
      <USkeleton v-for="i in 2" :key="i" class="h-14 w-full" />
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare i documenti di questo account"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />
    <UEmpty
      v-else-if="!rows.length"
      icon="i-lucide-file-signature"
      title="Nessun documento assegnato"
      description="Assegna un documento da firmare o da leggere: la persona riceve un’email con il link."
    />
    <DocumentsSignatureRequestList v-else :rows="rows" show="document" @changed="refresh" />

    <DocumentsAssignModal v-model:open="assignOpen" :user-ids="[userId]" @assigned="() => refresh()" />
  </div>
</template>
