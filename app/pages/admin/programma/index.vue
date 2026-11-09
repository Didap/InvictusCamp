<script setup lang="ts">
import type { z } from 'zod'
import type { ProgrammeCreateInput } from '#shared/schemas/programmes'
import { programmeCreateSchema } from '#shared/schemas/programmes'
import type { ProgrammeYearItem } from '#shared/types/programmes'
import { todayIso } from '#shared/utils/dates'
import { formatDateTime, plural } from '#shared/utils/format'

// The programmes, one per year (docs/spec.md 3.10): the years that have one, and the years whose
// sessions are still waiting for one. A new programme starts from the model week, as a copy of
// another year, or empty.
const api = useApi()
const { data, error, refresh } = await useApiFetch<ProgrammeYearItem[]>('/api/admin/programmes')
const items = computed(() => data.value ?? [])
const years = computed(() => items.value.filter(item => item.updatedAt).map(item => item.year))

function summary(item: ProgrammeYearItem): string {
  const sessions = item.sessions
    ? `${plural(item.sessions, 'sessione', 'sessioni')}${item.copies ? `, ${item.copies} con una copia propria` : ''}`
    : 'Nessuna sessione'
  return item.updatedAt ? `${sessions} · aggiornato il ${formatDateTime(item.updatedAt)}` : sessions
}

// ─── New programme ─────────────────────────────────────────────────────────────────────────────────

const formSchema = programmeCreateSchema.pick({ year: true })
const createOpen = ref(false)
const creating = ref(false)
const formId = useId()
const state = reactive({ year: 0 })
const from = ref('template')

const fromItems = computed(() => [
  {
    value: 'template',
    label: 'La settimana tipo',
    description: 'La bozza preparata per il 2027: arrivo, attività a gruppi a rotazione, serate e partenza.',
  },
  ...years.value.map(year => ({
    value: String(year),
    label: `Una copia del ${year}`,
    description: 'Gli stessi blocchi, da cambiare dove serve.',
  })),
  { value: 'empty', label: 'Una settimana vuota', description: 'Da lunedì a venerdì, senza blocchi.' },
])

function openCreate(year?: number) {
  const latest = years.value.length ? Math.max(...years.value) : null
  state.year = year ?? (latest ? latest + 1 : Number(todayIso().slice(0, 4)))
  from.value = latest ? String(latest) : 'template'
  createOpen.value = true
}

async function create(event: { data: z.output<typeof formSchema> }) {
  const body: ProgrammeCreateInput = {
    year: event.data.year,
    from: from.value === 'template' || from.value === 'empty' ? from.value : Number(from.value),
  }
  creating.value = true
  try {
    await api('/api/admin/programmes', { method: 'POST', body })
    createOpen.value = false
    await navigateTo(`/admin/programma/${body.year}`)
  } catch (err) {
    notifyError(err, 'Programma non creato')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <IcPage title="Programma">
    <template #actions>
      <UButton icon="i-lucide-plus" label="Nuovo programma" @click="openCreate()" />
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare i programmi"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <UEmpty
      v-else-if="!items.length"
      icon="i-lucide-calendar-clock"
      title="Nessun programma, per ora"
      description="Il programma è la settimana del camp, blocco per blocco. Ogni sessione usa quello del suo anno, oppure una copia tutta sua."
    />

    <template v-else>
      <p class="mb-6 max-w-prose text-muted">
        Un programma per anno: lo usano tutte le sessioni dell’anno, tranne quelle con una copia propria. Famiglie e
        staff della sessione lo leggono senza le note interne.
      </p>
      <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="item in items" :key="item.year" class="flex flex-wrap items-center justify-between gap-3 p-4">
          <div class="min-w-0">
            <p class="text-lg font-bold text-highlighted">
              <NuxtLink v-if="item.updatedAt" :to="`/admin/programma/${item.year}`" class="hover:underline">
                Programma {{ item.year }}
              </NuxtLink>
              <template v-else>{{ item.year }}, senza programma</template>
            </p>
            <p class="text-sm text-muted">{{ summary(item) }}</p>
          </div>
          <UButton
            v-if="item.updatedAt"
            :to="`/admin/programma/${item.year}`"
            label="Apri"
            :aria-label="`Apri il programma ${item.year}`"
            icon="i-lucide-arrow-right"
            trailing
            color="neutral"
            variant="outline"
            class="pointer-coarse:min-h-11"
          />
          <UButton
            v-else
            :label="`Crea il programma ${item.year}`"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            class="pointer-coarse:min-h-11"
            @click="openCreate(item.year)"
          />
        </li>
      </ul>
    </template>

    <UModal
      v-model:open="createOpen"
      title="Nuovo programma"
      :ui="{ wrapper: 'pe-12', close: 'pointer-coarse:size-11 pointer-coarse:justify-center' }"
    >
      <template #body>
        <UForm :id="formId" :schema="formSchema" :state="state" class="space-y-6" @submit="create">
          <UFormField label="Anno" name="year" required>
            <UInput v-model.number="state.year" type="number" inputmode="numeric" class="w-32" />
          </UFormField>
          <URadioGroup v-model="from" :items="fromItems" legend="Parti da" variant="card" />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="Annulla"
            class="pointer-coarse:min-h-11"
            @click="createOpen = false"
          />
          <UButton
            type="submit"
            :form="formId"
            label="Crea il programma"
            :loading="creating"
            class="pointer-coarse:min-h-11"
          />
        </div>
      </template>
    </UModal>
  </IcPage>
</template>
