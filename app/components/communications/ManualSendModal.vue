<script setup lang="ts">
import { audienceFromDraft, emptyAudienceDraft, type AudienceDraft } from '#shared/schemas/communications'
import type { ManualSendResult } from '#shared/types/automatic-emails'
import type { AudienceSummary, CommunicationOptions } from '#shared/types/communications'
import type { AudienceType } from '#shared/types/domain'
import { automaticEmailDefinition, type AutomaticEmailKey } from '#shared/utils/automatic-emails'
import { plural } from '#shared/utils/format'

// "Invia a mano": an automatic email with its saved texts, sent now to the people chosen, even when its
// event no longer sends it. Session emails go to the families of one session, with that session's facts.
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ emailKey: AutomaticEmailKey }>()

const api = useApi()
const confirm = useConfirm()

const email = computed(() => automaticEmailDefinition(props.emailKey))
const types = computed<AudienceType[]>(() =>
  email.value.manual === 'families' ? ['all_families', 'session_families', 'users'] : ['session_families'],
)

const { data: options } = await useApiFetch<CommunicationOptions>('/api/admin/communications/options')
const draft = ref<AudienceDraft>(emptyAudienceDraft(types.value[0]))
const audience = computed(() => audienceFromDraft(draft.value))
watch(open, value => {
  if (value) draft.value = emptyAudienceDraft(types.value[0])
})

const missing = computed(() => {
  const a = audience.value
  if (a.type === 'session_families' && !a.sessionId) return 'Scegli la sessione.'
  if (a.type === 'users' && !a.userIds.length) return 'Scegli almeno una famiglia.'
  return null
})

const summary = ref<AudienceSummary | null>(null)
let countRequest = 0
watchDebounced(
  [audience, open],
  async () => {
    const request = ++countRequest
    if (!open.value || missing.value) {
      summary.value = null
      return
    }
    try {
      const result = await api<AudienceSummary>('/api/admin/communications/audience', {
        method: 'POST',
        body: { audience: audience.value },
      })
      if (request === countRequest) summary.value = result
    } catch (error) {
      if (request === countRequest) summary.value = null
      notifyError(error, 'Conteggio non riuscito')
    }
  },
  { debounce: 300, deep: true, immediate: true },
)

const sending = ref(false)
async function send() {
  if (missing.value || !summary.value?.count || sending.value) return
  const emails = plural(summary.value.count, 'email', 'email')
  const ok = await confirm({
    title: `Invierai ${emails}`,
    description: `«${email.value.label}» parte adesso a ${summary.value.label.toLowerCase()}, con il testo salvato. Dopo l’invio non si può ritirare.`,
    confirmLabel: `Invia ${emails}`,
  })
  if (!ok) return
  sending.value = true
  try {
    const url: string = `/api/admin/automatic-emails/${props.emailKey}/send`
    const result = await api<ManualSendResult>(url, { method: 'POST', body: { audience: audience.value } })
    notifySuccess('Email inviata', deliveryOutcome(result))
    open.value = false
  } catch (error) {
    notifyError(error, 'Invio non riuscito')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Invia a mano «${email.label}»`"
    description="Parte adesso, con il testo salvato, anche se l’email è spenta."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-5">
        <CommunicationsAudiencePicker v-model="draft" :sessions="options?.sessions ?? []" :types="types" />
        <div class="rounded-lg border border-default bg-elevated p-4" role="status" aria-live="polite">
          <p v-if="missing" class="text-muted">{{ missing }}</p>
          <template v-else-if="summary">
            <p class="font-semibold text-highlighted">
              {{
                summary.count ? `La riceveranno ${plural(summary.count, 'persona', 'persone')}` : 'Nessuno la riceverà'
              }}
            </p>
            <p class="mt-1 text-sm text-muted">{{ summary.label }}</p>
          </template>
          <p v-else class="text-muted">Conto i destinatari…</p>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Annulla" @click="open = false" />
          <UButton
            icon="i-lucide-send"
            :label="summary?.count ? `Invia a ${plural(summary.count, 'persona', 'persone')}` : 'Invia'"
            :disabled="!!missing || !summary?.count"
            :loading="sending"
            @click="send"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
