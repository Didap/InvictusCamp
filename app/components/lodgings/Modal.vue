<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { lodgingSchema, type LodgingValues } from '#shared/schemas/lodgings'
import type { Lodging } from '#shared/types/lodgings'

// A lodging of the layout (docs/spec.md 3.11): location, name, beds and their kinds, accessibility, what it
// offers. A new one when `lodging` is null.
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ lodging: Lodging | null }>()
const emit = defineEmits<{ saved: [] }>()

const api = useApi()
/** The fields of a lodging, or of a new one. */
const formState = (lodging: Lodging | null) => ({
  location: lodging?.location,
  name: lodging?.name ?? '',
  beds: lodging?.beds ?? 4,
  singleBeds: lodging?.singleBeds ?? 0,
  doubleBeds: lodging?.doubleBeds ?? 0,
  sofaBeds: lodging?.sofaBeds ?? 0,
  accessible: lodging?.accessible ?? false,
  features: [...(lodging?.features ?? [])],
  description: lodging?.description ?? '',
})
const state = reactive(formState(null))
watch(open, value => {
  if (value) Object.assign(state, formState(props.lodging))
})

const enums = useEnums()
const featureItems = enums.options('lodgingFeature')
const locationItems = enums.options('lodgingLocation')
const BED_KINDS = [
  { name: 'doubleBeds', label: 'Letti matrimoniali' },
  { name: 'singleBeds', label: 'Letti singoli' },
  { name: 'sofaBeds', label: 'Divani letto' },
] as const

const saving = ref(false)
async function onSubmit(event: FormSubmitEvent<LodgingValues>) {
  saving.value = true
  try {
    const url: string = props.lodging ? `/api/admin/lodgings/${props.lodging.id}` : '/api/admin/lodgings'
    await api(url, { method: props.lodging ? 'PUT' : 'POST', body: event.data })
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
        <UFormField label="Località" name="location" required>
          <USelect v-model="state.location" :items="locationItems" placeholder="Scegli" class="w-full" />
        </UFormField>
        <UFormField
          label="Nome"
          name="name"
          required
          help="Il nome o il numero della stanza o dell’appartamento, ad esempio «Camera 3»."
        >
          <UInput v-model="state.name" maxlength="80" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField label="Posti letto" name="beds" required help="Quante persone ci dormono.">
          <UInputNumber v-model="state.beds" :min="1" :max="50" class="w-full" />
        </UFormField>
        <fieldset class="grid gap-4 sm:grid-cols-3">
          <legend class="mb-2 text-sm font-medium text-default">Letti</legend>
          <UFormField v-for="kind in BED_KINDS" :key="kind.name" :label="kind.label" :name="kind.name">
            <UInputNumber v-model="state[kind.name]" :min="0" :max="20" class="w-full" />
          </UFormField>
        </fieldset>
        <UFormField name="accessible">
          <UCheckbox
            v-model="state.accessible"
            label="Accessibile"
            description="Senza barriere architettoniche: si entra e ci si muove in carrozzina."
          />
        </UFormField>
        <UFormField name="features">
          <UCheckboxGroup
            v-model="state.features"
            :items="featureItems"
            legend="Dotazioni"
            :ui="{ fieldset: 'gap-y-3' }"
          />
        </UFormField>
        <UFormField label="Note" name="description" help="Altro da sapere, ad esempio il piano o dove sono le chiavi.">
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
