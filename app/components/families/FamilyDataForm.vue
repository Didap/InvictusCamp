<script setup lang="ts">
import { familyProfileSchema } from '#shared/schemas/families'
import type { FamilyProfileDto } from '#shared/types/families'
import type { ItalianRegion } from '#shared/utils/constants'

// The family's name, residence and phone, changed by the administration on the family's behalf
// (PATCH /api/admin/families/:id). The family itself changes them with the rest of its data on
// /famiglia/profilo.
const props = defineProps<{
  family: Pick<FamilyProfileDto, 'id' | 'name' | 'address' | 'city' | 'postalCode' | 'province' | 'region' | 'phone'>
}>()
const emit = defineEmits<{ saved: [] }>()

const state = reactive({
  name: '',
  address: '',
  city: '',
  postalCode: '',
  province: '',
  region: undefined as ItalianRegion | undefined,
  phone: '',
})
watch(
  () => props.family,
  family => {
    Object.assign(state, {
      name: family.name,
      address: family.address ?? '',
      city: family.city ?? '',
      postalCode: family.postalCode ?? '',
      province: family.province ?? '',
      region: family.region ?? undefined,
      phone: family.phone ?? '',
    })
  },
  { immediate: true },
)

const api = useApi()
const saving = ref(false)

async function save() {
  saving.value = true
  try {
    const url: string = `/api/admin/families/${props.family.id}`
    await api(url, { method: 'PATCH', body: state })
    notifySuccess('Dati della famiglia salvati')
    emit('saved')
  } catch (error) {
    notifyError(error, 'Dati non salvati')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UForm :schema="familyProfileSchema" :state="state" class="space-y-5" @submit="save">
    <UFormField
      label="Nome della famiglia"
      name="name"
      required
      help="Come appare negli elenchi, per esempio «Famiglia Rossi»."
    >
      <UInput v-model="state.name" class="w-full" />
    </UFormField>
    <FamiliesResidenceFields v-model="state" />
    <UFormField label="Telefono" name="phone" hint="Facoltativo">
      <UInput v-model="state.phone" type="tel" autocomplete="tel" class="w-full" />
    </UFormField>
    <div class="flex flex-wrap justify-end gap-2">
      <slot name="cancel" />
      <UButton type="submit" label="Salva" :loading="saving" class="pointer-coarse:min-h-11" />
    </div>
  </UForm>
</template>
