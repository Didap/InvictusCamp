<script setup lang="ts">
import { emailTemplateLabel } from '#shared/schemas/communications'
import type { EmailLogDetail } from '#shared/types/communications'
import { formatDateTime } from '#shared/utils/format'

// One email of the log: who, when, what, how it went, and its content when it was kept (access
// emails carry links or codes, so only their envelope is recorded).
const props = defineProps<{ emailId: string | null }>()
const open = defineModel<boolean>('open', { default: false })

const api = useApi()
const email = ref<EmailLogDetail | null>(null)
const loading = ref(false)

watch(
  () => [open.value, props.emailId] as const,
  async ([isOpen, id]) => {
    if (!isOpen || !id || email.value?.id === id) return
    loading.value = true
    email.value = null
    try {
      email.value = await api<EmailLogDetail>(`/api/admin/email-log/${id}`)
    } catch (error) {
      notifyError(error, 'Email non disponibile')
      open.value = false
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const details = computed(() =>
  email.value
    ? [
        {
          label: 'Destinatario',
          value: email.value.toName ? `${email.value.toName} (${email.value.toEmail})` : email.value.toEmail,
        },
        { label: 'Data', value: formatDateTime(email.value.createdAt) },
        { label: 'Tipo', value: emailTemplateLabel(email.value.template) },
        { label: 'Sessione', value: email.value.sessionTitle },
      ]
    : [],
)
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="email?.subject ?? 'Email'"
    description="Dal registro delle email"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div v-if="loading" class="space-y-3" aria-busy="true">
        <USkeleton class="h-5 w-2/3" />
        <USkeleton class="h-5 w-1/2" />
        <USkeleton class="h-64 w-full" />
      </div>
      <div v-else-if="email" class="space-y-6">
        <IcDataList :items="details" :columns="2" />
        <div class="flex flex-wrap items-center gap-3">
          <IcStatusBadge kind="emailStatus" :value="email.status" />
          <UButton
            v-if="email.communicationId"
            :to="`/admin/comunicazioni/${email.communicationId}`"
            label="Apri la comunicazione"
            trailing-icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
          />
        </div>
        <UAlert
          v-if="email.status === 'failed'"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="L’email non è stata recapitata"
          :description="email.error ?? 'Il servizio di invio non ha dato altre informazioni.'"
        />
        <CommunicationsEmailFrame
          v-if="email.html"
          :html="email.html"
          :title="`Contenuto dell’email: ${email.subject}`"
        />
        <UAlert
          v-else
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          title="Contenuto non conservato"
          description="Le email di accesso contengono link o codici personali: il registro tiene solo destinatario, oggetto ed esito."
        />
      </div>
    </template>
  </USlideover>
</template>
