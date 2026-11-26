<script setup lang="ts">
import type { MyStaffResource } from '#shared/types/documents'
import { formatDateTime } from '#shared/utils/format'

// «Risorse utili» (spec 3.6): what the administration puts here for staff and v-team. The documents to read and
// accept (confirmed or signed on /firma, as the document says; the request is made when the person opens it if they
// have none yet) and those to consult, always at hand.
const api = useApi()
const { label } = useEnums()
const { data } = await useApiFetch<MyStaffResource[]>('/api/staff/resources')
const resources = computed(() => data.value ?? [])
/** Each one to accept with what the person sees: when they accepted it, or the button to open it. */
const toAccept = computed(() =>
  resources.value
    .filter(r => r.mode === 'accept')
    .map(r => ({
      ...r,
      done:
        r.request?.status === 'signed'
          ? `${r.requiresSignature ? 'Firmato' : 'Letto e accettato'} il ${formatDateTime(r.request.signedAt)}`
          : null,
      action: r.requiresSignature ? 'Leggi e firma' : 'Leggi il documento',
    })),
)
const toConsult = computed(() => resources.value.filter(r => r.mode === 'consult'))

const opening = ref<string | null>(null)
async function open(r: MyStaffResource) {
  // Asked already (the usual case): straight to the signing page; otherwise the request is made first.
  if (r.request) return navigateTo(`/firma/${r.request.id}`)
  opening.value = r.id
  try {
    const url: string = `/api/staff/resources/${r.id}`
    const { requestId } = await api<{ requestId: string }>(url, { method: 'POST' })
    await navigateTo(`/firma/${requestId}`)
  } catch (error) {
    notifyError(error)
  } finally {
    opening.value = null
  }
}
</script>

<template>
  <IcPage title="Risorse utili" width="narrow">
    <template v-if="data">
      <UEmpty
        v-if="!resources.length"
        icon="i-lucide-library"
        title="Ancora nessuna risorsa"
        description="Qui trovi i documenti che l’amministrazione ti chiede di leggere e accettare, come il regolamento, e quelli da consultare."
        variant="naked"
      />

      <IcSection
        v-if="toAccept.length"
        title="Da leggere e accettare"
        description="Documenti da leggere con attenzione: confermi la lettura, o firmi, quando hai finito."
      >
        <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li
            v-for="r in toAccept"
            :key="r.id"
            class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3"
          >
            <div class="min-w-0 space-y-1">
              <p class="font-semibold text-highlighted">{{ r.title }}</p>
              <p class="text-sm text-muted">{{ label('documentCategory', r.category) }}</p>
              <IcFileLink :file="r.file" />
              <p v-if="r.description" class="max-w-prose text-sm whitespace-pre-line">{{ r.description }}</p>
              <p v-if="r.done" class="text-sm text-muted">{{ r.done }}</p>
            </div>
            <UButton
              v-if="!r.done"
              :label="r.action"
              icon="i-lucide-pen-line"
              color="neutral"
              variant="outline"
              :loading="opening === r.id"
              class="pointer-coarse:min-h-11"
              @click="open(r)"
            />
          </li>
        </ul>
      </IcSection>

      <IcSection v-if="toConsult.length" title="Da consultare" description="Documenti sempre a disposizione.">
        <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li v-for="r in toConsult" :key="r.id" class="space-y-1 px-4 py-3">
            <p class="font-semibold text-highlighted">{{ r.title }}</p>
            <p class="text-sm text-muted">{{ label('documentCategory', r.category) }}</p>
            <IcFileLink :file="r.file" />
            <p v-if="r.description" class="max-w-prose text-sm whitespace-pre-line">{{ r.description }}</p>
          </li>
        </ul>
      </IcSection>
    </template>
  </IcPage>
</template>
