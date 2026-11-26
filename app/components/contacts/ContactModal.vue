<script setup lang="ts">
import { contactInputSchema, type ContactInput } from '#shared/schemas/contacts'
import type { ContactListItem } from '#shared/types/contacts'

// A contact of the «Anagrafica» added by hand or changed (spec 3.16): type, names, email, groups. No email leaves.
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ contact?: ContactListItem | null }>()
const emit = defineEmits<{ saved: [] }>()

const api = useApi()
const { options } = useEnums()
const kindItems = options('contactKind')

const blank = (): ContactInput => ({ kind: 'family', firstName: '', lastName: '', email: '', groupIds: [] })
const state = reactive<ContactInput>(blank())
watch(open, value => {
  if (!value) return
  const contact = props.contact
  Object.assign(
    state,
    contact
      ? {
          kind: contact.kind,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          groupIds: [...contact.groupIds],
        }
      : blank(),
  )
})

const saving = ref(false)
async function onSubmit() {
  saving.value = true
  try {
    const id = props.contact?.id
    const url: string = id ? `/api/admin/contacts/${id}` : '/api/admin/contacts'
    await api(url, { method: id ? 'PUT' : 'POST', body: { ...state } })
    notifySuccess(id ? 'Contatto salvato' : 'Contatto aggiunto', state.email.trim())
    emit('saved')
    open.value = false
  } catch (error) {
    notifyError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="contact ? 'Modifica il contatto' : 'Aggiungi un contatto'"
    description="Resta nell’anagrafica: non parte nessuna email."
  >
    <template #body>
      <UForm :schema="contactInputSchema" :state="state" class="space-y-5" @submit="onSubmit">
        <UFormField label="Tipo" name="kind" required>
          <USelect v-model="state.kind" :items="kindItems" class="w-full" />
        </UFormField>
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Nome" name="firstName">
            <UInput v-model="state.firstName" autocomplete="off" class="w-full" />
          </UFormField>
          <UFormField label="Cognome" name="lastName">
            <UInput v-model="state.lastName" autocomplete="off" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Email" name="email" required>
          <UInput v-model="state.email" type="email" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField label="Gruppi" name="groupIds" hint="Facoltativo">
          <ContactsGroupSelect v-model="state.groupIds" aria-label="Gruppi del contatto" />
        </UFormField>
        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="Annulla" @click="open = false" />
          <UButton type="submit" icon="i-lucide-check" :label="contact ? 'Salva' : 'Aggiungi'" :loading="saving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
