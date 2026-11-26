<script setup lang="ts">
import type { MyTrainingOption } from '#shared/types/staff'

// «Formazione» (spec 3.4): the trainings the camp may organise; the person ticks those that interest them, each
// tick saved at once. The administration sees who is interested.
const api = useApi()
const { data, refresh } = await useApiFetch<MyTrainingOption[]>('/api/staff/training')
const options = computed(() => data.value ?? [])

/** The proposals being saved: each checkbox waits for its own answer. */
const saving = ref(new Set<string>())
async function toggle(option: MyTrainingOption, interested: boolean) {
  saving.value.add(option.id)
  try {
    const url: string = `/api/staff/training/${option.id}`
    await api(url, { method: 'PUT', body: { interested } })
    // The fetched data is a shallow ref: a new array, so the list follows.
    data.value = options.value.map(o => (o.id === option.id ? { ...o, interested } : o))
  } catch (error) {
    notifyError(error, 'Preferenza non salvata')
    await refresh()
  } finally {
    saving.value.delete(option.id)
  }
}
</script>

<template>
  <IcPage title="Formazione" width="narrow">
    <IcSection
      title="I tuoi interessi"
      description="Sezione dedicata a raccogliere i tuoi interessi e le tue disponibilità in vista di possibili formazioni promosse da Invictus Camp. Spunta quelle che ti interessano: si salvano subito."
    >
      <UEmpty
        v-if="!options.length"
        icon="i-lucide-graduation-cap"
        title="Ancora nessuna proposta"
        description="Quando proponiamo delle formazioni, le trovi qui."
        variant="naked"
      />
      <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="option in options" :key="option.id" class="px-4 py-3">
          <UCheckbox
            :model-value="option.interested"
            :disabled="saving.has(option.id)"
            :label="option.title"
            class="pointer-coarse:min-h-11"
            @update:model-value="value => toggle(option, value === true)"
          >
            <template v-if="option.description" #description>
              <span class="whitespace-pre-line">{{ option.description }}</span>
            </template>
          </UCheckbox>
        </li>
      </ul>
    </IcSection>
  </IcPage>
</template>
