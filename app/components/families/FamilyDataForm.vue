<script setup lang="ts">
import { familyProfileSchema } from '#shared/schemas/families'
import type { FamilyProfileDto } from '#shared/types/families'

// The family's data (name, address, city, province, phone): the family on /famiglia/profilo
// (PUT /api/family/profile) and the administration on its behalf (PATCH /api/admin/families/:id).
const props = defineProps<{
  family: Pick<FamilyProfileDto, 'name' | 'address' | 'city' | 'province' | 'phone'>
  endpoint: string
  method: 'PUT' | 'PATCH'
  submitLabel: string
  /** Solid primary button (a modal); outline when the page has another primary action. */
  primary?: boolean
}>()
const emit = defineEmits<{ saved: [result: unknown] }>()

const state = reactive({ name: '', address: '', city: '', province: '', phone: '' })
watch(
  () => props.family,
  family => {
    Object.assign(state, {
      name: family.name,
      address: family.address ?? '',
      city: family.city ?? '',
      province: family.province ?? '',
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
    const result = await api(props.endpoint, { method: props.method, body: state })
    notifySuccess('Dati della famiglia salvati')
    emit('saved', result)
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
    <UFormField label="Indirizzo" name="address" hint="Facoltativo">
      <UInput v-model="state.address" autocomplete="street-address" class="w-full" />
    </UFormField>
    <div class="grid gap-5 sm:grid-cols-[1fr_10rem]">
      <UFormField label="Città" name="city" hint="Facoltativo">
        <UInput v-model="state.city" autocomplete="address-level2" class="w-full" />
      </UFormField>
      <UFormField label="Provincia" name="province" hint="Facoltativo" help="La sigla, per esempio TA.">
        <UInput v-model="state.province" maxlength="2" autocomplete="off" class="w-full uppercase" />
      </UFormField>
    </div>
    <UFormField label="Telefono" name="phone" hint="Facoltativo">
      <UInput v-model="state.phone" type="tel" autocomplete="tel" class="w-full" />
    </UFormField>
    <div class="flex flex-wrap gap-2" :class="primary ? 'justify-end' : ''">
      <slot name="cancel" />
      <UButton
        type="submit"
        :color="primary ? 'primary' : 'neutral'"
        :variant="primary ? 'solid' : 'outline'"
        :label="submitLabel"
        :loading="saving"
        class="pointer-coarse:min-h-11"
      />
    </div>
  </UForm>
</template>
