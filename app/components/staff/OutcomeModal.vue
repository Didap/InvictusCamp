<script setup lang="ts">
import { staffOutcomeSchema } from '#shared/schemas/staff'
import type { StaffOutcome } from '#shared/types/staff'
import { formatDateTime } from '#shared/utils/format'

// "Comunica l’esito" (spec 3.4): never automatic. The administration reads the proposed message, edits
// it if it wants, and sends one email (`staff.approved` or `staff.rejected`).
const props = defineProps<{
  userId: string
  firstName: string
  name: string
  email: string
  outcome: StaffOutcome
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ sent: [] }>()

const api = useApi()
const formId = useId()
const state = reactive({ message: '' })
const sending = ref(false)

watch(open, value => {
  if (value) state.message = props.outcome.defaultMessage
})

async function send() {
  sending.value = true
  try {
    const report = await api<{ sent: number; failed: number; simulated: number }>(
      `/api/admin/staff/${props.userId}/outcome`,
      { method: 'POST', body: { message: state.message } },
    )
    if (report.failed) {
      notifyError({ data: { message: 'L’email non è stata recapitata: riprova più tardi o controlla il registro.' } })
    } else {
      notifySuccess('Esito comunicato', `Email inviata a ${props.name}.`)
    }
    open.value = false
    emit('sent')
  } catch (error) {
    notifyError(error, 'Invio non riuscito')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Comunica l’esito" :description="`Partirà 1 email a ${name} (${email}).`">
    <template #body>
      <UForm :id="formId" :schema="staffOutcomeSchema" :state="state" class="space-y-4" @submit="send">
        <UAlert
          v-if="outcome.sentAt"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          :title="`Esito già comunicato il ${formatDateTime(outcome.sentAt)}`"
          description="Se invii di nuovo, la persona riceve una seconda email."
        />
        <div class="space-y-1 text-sm">
          <p>
            <span class="font-semibold text-muted">Oggetto:</span>
            <span class="text-highlighted">{{ outcome.subject }}</span>
          </p>
          <p><span class="font-semibold text-muted">Inizio:</span> «Ciao {{ firstName }},»</p>
        </div>
        <UFormField
          label="Messaggio"
          name="message"
          help="Puoi modificarlo. Le righe vuote separano i paragrafi."
          required
        >
          <UTextarea v-model="state.message" :rows="9" autoresize :maxlength="5000" class="w-full" />
        </UFormField>
        <p v-if="outcome.template === 'staff.approved'" class="text-sm text-muted">
          Sotto il messaggio l’email ha il pulsante «Entra nel gestionale».
        </p>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          class="pointer-coarse:min-h-11"
          color="neutral"
          variant="outline"
          label="Annulla"
          @click="open = false"
        />
        <UButton
          class="pointer-coarse:min-h-11"
          type="submit"
          :form="formId"
          icon="i-lucide-send"
          label="Invia l’email"
          :loading="sending"
        />
      </div>
    </template>
  </UModal>
</template>
