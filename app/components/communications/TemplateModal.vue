<script setup lang="ts">
import { messageTemplateSchema, type MessageTemplateInput } from '#shared/schemas/communications'
import type { MessageTemplate } from '#shared/types/communications'
import { MESSAGE_FIELDS_HELP } from '#shared/utils/message-fields'

// A saved message (docs/spec.md, 3.7): name, subject, body. A new one when `template` is null.
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ template: MessageTemplate | null }>()
const emit = defineEmits<{ saved: [] }>()

const api = useApi()
const state = reactive<MessageTemplateInput>({ name: '', subject: '', body: '' })
watch(open, value => {
  if (value) {
    Object.assign(state, {
      name: props.template?.name ?? '',
      subject: props.template?.subject ?? '',
      body: props.template?.body ?? '',
    })
  }
})

const saving = ref(false)
async function onSubmit() {
  saving.value = true
  try {
    const url: string = props.template
      ? `/api/admin/message-templates/${props.template.id}`
      : '/api/admin/message-templates'
    await api(url, { method: props.template ? 'PUT' : 'POST', body: state })
    notifySuccess('Modello salvato', 'Nessuna email è partita.')
    emit('saved')
    open.value = false
  } catch (error) {
    notifyError(error, 'Modello non salvato')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="template ? 'Modifica il modello' : 'Nuovo modello'"
    description="Il punto di partenza di un messaggio: prima di ogni invio oggetto e testo si possono cambiare."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UForm :schema="messageTemplateSchema" :state="state" class="space-y-5" @submit="onSubmit">
        <UFormField
          label="Nome del modello"
          name="name"
          required
          help="Non arriva ai destinatari: serve a ritrovarlo, ad esempio «Convocazione staff»."
        >
          <UInput v-model="state.name" maxlength="80" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField label="Oggetto" name="subject" required>
          <UInput v-model="state.subject" maxlength="200" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField label="Testo" name="body" required :help="MESSAGE_FIELDS_HELP">
          <UTextarea v-model="state.body" :rows="10" autoresize :maxrows="20" class="w-full" />
        </UFormField>
        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="Annulla" @click="open = false" />
          <UButton type="submit" icon="i-lucide-save" label="Salva il modello" :loading="saving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
