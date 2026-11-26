<script setup lang="ts">
import type { MyStaffResource } from '#shared/types/documents'
import { formatDateTime } from '#shared/utils/format'

// «Risorse utili» (spec 3.6): what the administration puts here for staff and v-team. The documents to read and
// accept (each confirmed on /firma, or signed as the document says) and those to consult, always at hand.
const { label } = useEnums()
const { data } = await useApiFetch<MyStaffResource[]>('/api/staff/resources')
const resources = computed(() => data.value ?? [])
const toAccept = computed(() => resources.value.filter(r => r.mode === 'accept'))
const toConsult = computed(() => resources.value.filter(r => r.mode === 'consult'))

/** What the person does with a resource to accept, from its request. */
function acceptState(r: MyStaffResource) {
  const request = r.request
  if (!request) return { text: 'Non ancora richiesto', action: null }
  const sign = request.requiresSignature
  if (request.status === 'signed') {
    return { text: `${sign ? 'Firmato' : 'Letto e accettato'} il ${formatDateTime(request.signedAt)}`, action: null }
  }
  return { text: null, action: { label: sign ? 'Leggi e firma' : 'Leggi e accetta', to: `/firma/${request.id}` } }
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
              <p v-if="acceptState(r).text" class="text-sm text-muted">{{ acceptState(r).text }}</p>
            </div>
            <UButton
              v-if="acceptState(r).action"
              :to="acceptState(r).action!.to"
              :label="acceptState(r).action!.label"
              icon="i-lucide-pen-line"
              class="pointer-coarse:min-h-11"
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
