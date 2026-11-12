<script setup lang="ts">
import { lodgingSchema, type LodgingInput } from '#shared/schemas/lodgings'
import type { Lodging } from '#shared/types/lodgings'

// A lodging of the layout (docs/spec.md 3.11): name, area, beds, what it offers. A new one when
// `lodging` is null.
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ lodging: Lodging | null }>()
const emit = defineEmits<{ saved: [] }>()

const api = useApi()
/** The fields of a lodging, or of a new one. */
const formState = (lodging: Lodging | null) => ({
  name: lodging?.name ?? '',
  area: lodging?.area ?? '',
  beds: lodging?.beds ?? 4,
  features: [...(lodging?.features ?? [])],
  description: lodging?.description ?? '',
})
const state = reactive(formState(null))
watch(open, value => {
  if (value) Object.assign(state, formState(props.lodging))
})

const featureItems = useEnums().options('lodgingFeature')

const saving = ref(false)
async function onSubmit() {
  saving.value = true
  try {
    const url: string = props.lodging ? `/api/admin/lodgings/${props.lodging.id}` : '/api/admin/lodgings'
    const body: LodgingInput = state
    await api(url, { method: props.lodging ? 'PUT' : 'POST', body })
    notifySuccess('Alloggio salvato')
    emit('saved')
    open.value = false
  } catch (error) {
    notifyError(error, 'Alloggio non salvato')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="lodging ? 'Modifica l’alloggio' : 'Nuovo alloggio'"
    description="Vale per tutte le sessioni: le famiglie già assegnate restano dove sono."
  >
    <template #body>
      <UForm :schema="lodgingSchema" :state="state" class="space-y-5" @submit="onSubmit">
        <UFormField label="Nome" name="name" required help="Come lo chiamate al camp, ad esempio «Villetta 3».">
          <UInput v-model="state.name" maxlength="80" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField
          label="Zona"
          name="area"
          help="Raggruppa lo schema, ad esempio «Villette» o «Residence». Puoi lasciarla vuota."
        >
          <UInput v-model="state.area" maxlength="80" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField label="Posti letto" name="beds" required>
          <UInputNumber v-model="state.beds" :min="1" :max="50" class="w-full" />
        </UFormField>
        <UFormField name="features">
          <UCheckboxGroup
            v-model="state.features"
            :items="featureItems"
            legend="Dotazioni"
            :ui="{ fieldset: 'gap-y-3' }"
          />
        </UFormField>
        <UFormField label="Come sono i letti" name="description" help="Ad esempio «1 matrimoniale e 2 singoli».">
          <UInput v-model="state.description" maxlength="300" autocomplete="off" class="w-full" />
        </UFormField>
        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="Annulla" @click="open = false" />
          <UButton type="submit" icon="i-lucide-save" label="Salva l’alloggio" :loading="saving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
