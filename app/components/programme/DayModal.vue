<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import { programmeDayNameSchema, type ProgrammeDayNameValues } from '#shared/schemas/programmes'
import type { ProgrammeDay } from '#shared/types/domain'

// Names a day: a new one (`day` null, `suggested` as its name) or one of the week. Two days of the
// same week cannot share a name: "Sposta a", the rotation and the dates go by the names.
const props = defineProps<{
  day: ProgrammeDay | null
  days: Pick<ProgrammeDay, 'id' | 'name'>[]
  suggested?: string
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ submit: [value: ProgrammeDayNameValues] }>()

const formId = useId()
const state = reactive<ProgrammeDayNameValues>({ name: '', subtitle: '' })
watch(open, value => {
  if (!value) return
  state.name = props.day?.name ?? props.suggested ?? ''
  state.subtitle = props.day?.subtitle ?? ''
})

function validate(values: Partial<ProgrammeDayNameValues>): FormError[] {
  const name = values.name?.trim().toLowerCase()
  const taken = props.days.some(other => other.id !== props.day?.id && other.name.toLowerCase() === name)
  return taken ? [{ name: 'name', message: 'C’è già un giorno con questo nome' }] : []
}

function onSubmit(event: FormSubmitEvent<ProgrammeDayNameValues>) {
  emit('submit', event.data)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="day ? 'Modifica il giorno' : 'Nuovo giorno'"
    :ui="{ wrapper: 'pe-12', close: 'pointer-coarse:size-11 pointer-coarse:justify-center' }"
  >
    <template #body>
      <UForm
        :id="formId"
        :schema="programmeDayNameSchema"
        :validate="validate"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
        <UFormField label="Nome" name="name" required help="Per esempio «Sabato» o «Giorno 1».">
          <UInput v-model="state.name" :maxlength="40" class="w-full" />
        </UFormField>
        <UFormField label="Sottotitolo" name="subtitle" hint="Facoltativo" help="Per esempio «Arrivo» o «Partenza».">
          <UInput v-model="state.subtitle" :maxlength="60" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          label="Annulla"
          class="pointer-coarse:min-h-11"
          @click="open = false"
        />
        <UButton
          type="submit"
          :form="formId"
          :label="day ? 'Applica' : 'Aggiungi il giorno'"
          class="pointer-coarse:min-h-11"
        />
      </div>
    </template>
  </UModal>
</template>
