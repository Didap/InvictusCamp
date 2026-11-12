<script setup lang="ts">
import type { ProgrammeSaveInput } from '#shared/schemas/programmes'
import type { ProgrammeDto } from '#shared/types/programmes'

// The programme of one year (docs/spec.md 3.10), used by every session of the year without a copy.
definePageMeta({ key: route => String(route.params.year) })

const route = useRoute()
const api = useApi()
const year = computed(() => String(route.params.year))
const { data, error, refresh } = await useApiFetch<ProgrammeDto>(() => `/api/admin/programmes/${year.value}`)

async function save(body: ProgrammeSaveInput) {
  const url: string = `/api/admin/programmes/${year.value}`
  data.value = await api<ProgrammeDto>(url, { method: 'PUT', body })
}
</script>

<template>
  <IcPage :title="`Programma ${year}`" back="/admin/programma" width="wide">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare il programma"
      :description="apiErrorMessage(error)"
      :actions="[
        { label: 'Riprova', color: 'neutral', variant: 'outline', onClick: () => refresh() },
        { label: 'Torna ai programmi', color: 'neutral', variant: 'ghost', to: '/admin/programma' },
      ]"
    />
    <template v-else-if="data">
      <p class="mb-2 max-w-prose text-muted">
        Lo usano le sessioni del {{ year }} che non hanno una copia propria. Lo staff della sessione lo legge tutto; le
        famiglie senza le note interne e senza i blocchi «Solo staff».
      </p>
      <ProgrammeEditor :programme="data" :save="save" />
    </template>
  </IcPage>
</template>
