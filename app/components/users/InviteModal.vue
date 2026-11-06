<script setup lang="ts">
import { inviteUserSchema, type InviteUserInput } from '#shared/schemas/users'
import type { UserRole } from '#shared/utils/constants'

// "Invita una persona" (docs/spec.md, 3.1): the account waits for its password; the invitation link
// lasts 7 days. A family gets its record, staff the profile with the starting status chosen here.
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ invited: [] }>()

const api = useApi()

const blank = () => ({
  role: 'family' as UserRole,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  familyName: '',
  staffStatus: 'registered' as 'registered' | 'approved',
})
const state = reactive(blank())
watch(open, value => {
  if (value) Object.assign(state, blank())
})

const roleItems = [
  { value: 'family', label: 'Famiglia', description: 'La persona di riferimento di una famiglia' },
  { value: 'staff', label: 'Staff', description: 'Chi lavora o fa volontariato al camp' },
  { value: 'admin', label: 'Amministrazione', description: 'Accesso completo al gestionale' },
]
const staffStatusItems = [
  {
    value: 'registered',
    label: 'Deve inviare la candidatura',
    description: 'La completa nel gestionale, poi tu la valuti',
  },
  {
    value: 'approved',
    label: 'Già approvato',
    description: 'Può dare subito la disponibilità ed essere convocato',
  },
]

const saving = ref(false)

async function onSubmit() {
  saving.value = true
  try {
    const body: InviteUserInput = {
      role: state.role,
      firstName: state.firstName,
      lastName: state.lastName,
      email: state.email,
      ...(state.phone.trim() ? { phone: state.phone } : {}),
      ...(state.role === 'family' && state.familyName.trim() ? { familyName: state.familyName } : {}),
      ...(state.role === 'staff' ? { staffStatus: state.staffStatus } : {}),
    }
    await api('/api/admin/users', { method: 'POST', body })
    notifySuccess('Invito inviato', `${state.email.trim()} riceverà il link per scegliere la password.`)
    emit('invited')
    open.value = false
  } catch (error) {
    notifyError(error, 'Invito non riuscito')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Invita una persona"
    description="Partirà 1 email con il link per scegliere la password. Il link vale 7 giorni."
  >
    <template #body>
      <UForm :schema="inviteUserSchema" :state="state" class="space-y-5" @submit="onSubmit">
        <URadioGroup
          v-model="state.role"
          legend="Ruolo"
          :items="roleItems"
          variant="card"
          :ui="{ legend: 'mb-2 text-sm font-semibold text-default', fieldset: 'gap-2' }"
        />
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Nome" name="firstName" required>
            <UInput v-model="state.firstName" autocomplete="off" class="w-full" />
          </UFormField>
          <UFormField label="Cognome" name="lastName" required>
            <UInput v-model="state.lastName" autocomplete="off" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Email" name="email" required>
          <UInput v-model="state.email" type="email" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField label="Telefono" name="phone" hint="Facoltativo">
          <UInput v-model="state.phone" type="tel" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField
          v-if="state.role === 'family'"
          label="Nome della famiglia"
          name="familyName"
          hint="Facoltativo"
          :help="`Se lo lasci vuoto: Famiglia ${state.lastName.trim() || 'e il cognome'}.`"
        >
          <UInput v-model="state.familyName" autocomplete="off" class="w-full" />
        </UFormField>
        <URadioGroup
          v-if="state.role === 'staff'"
          v-model="state.staffStatus"
          legend="Candidatura"
          :items="staffStatusItems"
          variant="card"
          :ui="{ legend: 'mb-2 text-sm font-semibold text-default', fieldset: 'gap-2' }"
        />
        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="Annulla" @click="open = false" />
          <UButton type="submit" icon="i-lucide-send" label="Invia l’invito" :loading="saving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
