<script setup lang="ts">
import {
  AUDIENCE_TYPES,
  audienceFromDraft,
  audienceSessionId,
  communicationSchema,
  draftFromAudience,
  emptyAudienceDraft,
  type AudienceDraft,
} from '#shared/schemas/communications'
import type {
  AudienceSummary,
  CommunicationDetail,
  CommunicationOptions,
  CommunicationSendResult,
  EmailPreview,
  MessageTemplate,
} from '#shared/types/communications'
import type { AudienceType } from '#shared/types/domain'
import { plural } from '#shared/utils/format'
import { fillMessageFields, MESSAGE_FIELDS_HELP, messageFieldValues } from '#shared/utils/message-fields'

// The composer (docs/spec.md, 3.7): audience, live count of the recipients, subject and plain text
// body, the email previewed by the real template, confirmation with the number of emails, send.
// Opened with ?audience=session_families&sessionId=…, ?audience=session_staff&sessionId=…,
// ?userIds=id1,id2 (the "Scrivi" buttons of the other pages), ?bozza=<id> (a saved draft) or
// ?modello=<id> (a saved template, from the Modelli tab).
const route = useRoute()
const router = useRouter()
const api = useApi()
const confirm = useConfirm()
const toast = useToast()
const warn = (title: string) => toast.add({ title, color: 'warning', icon: 'i-lucide-circle-alert' })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const queryText = (key: string) => (typeof route.query[key] === 'string' ? (route.query[key] as string) : '')

function prefilled(): AudienceDraft {
  const userIds = queryText('userIds')
    .split(',')
    .filter(id => UUID.test(id))
  if (userIds.length) return { ...emptyAudienceDraft('users'), userIds: [...new Set(userIds)] }
  const type = AUDIENCE_TYPES.find(value => value === queryText('audience')) ?? ('all_families' as AudienceType)
  const draft = emptyAudienceDraft(type)
  if (UUID.test(queryText('sessionId'))) draft.sessionId = queryText('sessionId')
  return draft
}

const draftId = ref(UUID.test(queryText('bozza')) ? queryText('bozza') : null)
const audienceDraft = ref<AudienceDraft>(prefilled())
const state = reactive({ subject: '', body: '', audience: computed(() => audienceFromDraft(audienceDraft.value)) })

const [{ data: options }, { data: templates }] = await Promise.all([
  useApiFetch<CommunicationOptions>('/api/admin/communications/options'),
  useApiFetch<MessageTemplate[]>('/api/admin/message-templates'),
])

if (draftId.value) {
  try {
    const saved = await api<CommunicationDetail>(`/api/admin/communications/${draftId.value}`)
    if (saved.sentAt) {
      await navigateTo(`/admin/comunicazioni/${saved.id}`, { replace: true })
    } else {
      state.subject = saved.subject
      state.body = saved.body
      audienceDraft.value = draftFromAudience(saved.audience)
    }
  } catch (error) {
    notifyError(error, 'Bozza non trovata')
    draftId.value = null
  }
}

// ─── Template ──────────────────────────────────────────────────────────────────────────────────────
/** Writes the template's subject and body in, after asking when that replaces what is written. */
async function applyTemplate(template: MessageTemplate) {
  const written = state.subject.trim() || state.body.trim()
  const same = state.subject === template.subject && state.body === template.body
  if (written && !same) {
    const ok = await confirm({
      title: 'Sostituisci oggetto e testo?',
      description: `Quello che hai scritto lascia il posto al modello «${template.name}». Nessuna email parte.`,
      confirmLabel: 'Usa il modello',
    })
    if (!ok) return
  }
  state.subject = template.subject
  state.body = template.body
}
const templateItems = computed(() =>
  (templates.value ?? []).map(template => ({ label: template.name, onSelect: () => applyTemplate(template) })),
)
if (!draftId.value && UUID.test(queryText('modello'))) {
  const template = templates.value?.find(t => t.id === queryText('modello'))
  if (template) await applyTemplate(template)
  else warn('Modello non trovato: forse è stato eliminato.')
}

// ─── Live count ────────────────────────────────────────────────────────────────────────────────────
const summary = ref<AudienceSummary | null>(null)
const counting = ref(false)
/** What is still missing before the audience can be counted. */
const missing = computed(() => {
  const audience = state.audience
  if ((audience.type === 'session_families' || audience.type === 'session_staff') && !audience.sessionId) {
    return 'Scegli la sessione per vedere quante persone ricevono il messaggio.'
  }
  if (audience.type === 'users' && !audience.userIds.length) return 'Scegli almeno una persona.'
  return null
})
let countRequest = 0
/** Counts the audience chosen now and returns its summary (null when it cannot be counted); the last call shows. */
async function refreshSummary(): Promise<AudienceSummary | null> {
  const request = ++countRequest
  const audience = state.audience
  if (missing.value) {
    summary.value = null
    counting.value = false
    return null
  }
  counting.value = true
  try {
    const result = await api<AudienceSummary>('/api/admin/communications/audience', {
      method: 'POST',
      body: { audience },
    })
    if (request === countRequest) summary.value = result
    return result
  } catch (error) {
    if (request === countRequest) summary.value = null
    notifyError(error, 'Conteggio non riuscito')
    return null
  } finally {
    if (request === countRequest) counting.value = false
  }
}
watchDebounced(() => JSON.stringify(state.audience), refreshSummary, { debounce: 300, immediate: true })

// ─── Preview ───────────────────────────────────────────────────────────────────────────────────────
const chosenSession = computed(
  () => options.value?.sessions.find(session => session.id === audienceSessionId(state.audience)) ?? null,
)
/** Subject and body as one recipient receives them: {nome}, {sessione}, {date} written in. */
function filledFor(firstName: string | undefined) {
  const values = messageFieldValues(firstName, chosenSession.value)
  return { subject: fillMessageFields(state.subject, values), body: fillMessageFields(state.body, values) }
}

const firstRecipient = computed(() => summary.value?.recipients[0])
const previewText = computed(() => filledFor(firstRecipient.value?.firstName))
const preview = ref<EmailPreview | null>(null)
let previewRequest = 0
watchDebounced(
  [() => previewText.value.subject, () => previewText.value.body],
  async ([subject, body]) => {
    const request = ++previewRequest
    try {
      const result = await api<EmailPreview>('/api/admin/communications/preview', {
        method: 'POST',
        body: { subject: subject.slice(0, 200), body: body.slice(0, 20_000) },
      })
      if (request === previewRequest) preview.value = result
    } catch {
      // The preview keeps the last good render; the form says what is wrong.
    }
  },
  { debounce: 500, immediate: true },
)

// ─── Save and send ─────────────────────────────────────────────────────────────────────────────────
const sending = ref(false)
const saving = ref(false)
const count = computed(() => summary.value?.count ?? 0)

async function send() {
  if (sending.value) return
  // The confirmation counts the audience as it is now, and exactly that message leaves.
  const message = { subject: state.subject, body: state.body, audience: state.audience }
  sending.value = true
  try {
    const fresh = await refreshSummary()
    if (!fresh) {
      // Something is missing, or the count failed and has already said so.
      if (missing.value) warn(missing.value)
      return
    }
    if (!fresh.count) {
      warn('Nessun destinatario: nessun account attivo corrisponde alla scelta.')
      return
    }
    const emails = plural(fresh.count, 'email', 'email')
    const names = fresh.recipients.map(person => person.name)
    const who = names.length <= 3 ? names.join(', ') : fresh.label
    const ok = await confirm({
      title: `Invierai ${emails}`,
      description: `Destinatari: ${who}. ${fresh.count === 1 ? 'Riceve' : 'Ognuno riceve'} «${filledFor(fresh.recipients[0]?.firstName).subject.trim()}» al proprio indirizzo. Dopo l’invio il messaggio non si può ritirare.`,
      confirmLabel: `Invia ${emails}`,
    })
    if (!ok) return
    const result = await api<CommunicationSendResult>(
      draftId.value ? `/api/admin/communications/${draftId.value}/send` : '/api/admin/communications',
      { method: 'POST', body: message },
    )
    const outcome = result.failed
      ? `${plural(result.failed, 'email non recapitata', 'email non recapitate')}: le trovi nel registro.`
      : result.simulated
        ? `${plural(result.simulated, 'email registrata come simulata', 'email registrate come simulate')}: in questo ambiente non partono davvero.`
        : `${plural(result.sent, 'email partita', 'email partite')}.`
    notifySuccess('Messaggio inviato', outcome)
    await navigateTo(`/admin/comunicazioni/${result.id}`)
  } catch (error) {
    notifyError(error, 'Invio non riuscito')
  } finally {
    sending.value = false
  }
}

async function saveDraft() {
  if (!state.subject.trim()) {
    warn('Scrivi almeno l’oggetto per salvare la bozza.')
    return
  }
  saving.value = true
  try {
    const body = { subject: state.subject, body: state.body, audience: state.audience }
    if (draftId.value) {
      await api(`/api/admin/communications/${draftId.value}`, { method: 'PUT', body })
    } else {
      const { id } = await api<{ id: string }>('/api/admin/communications/drafts', { method: 'POST', body })
      draftId.value = id
      await router.replace({ query: { bozza: id } })
    }
    notifySuccess('Bozza salvata', 'Nessuna email è partita. La ritrovi tra i messaggi.')
  } catch (error) {
    notifyError(error, 'Bozza non salvata')
  } finally {
    saving.value = false
  }
}

async function deleteDraft() {
  if (!draftId.value) return
  const ok = await confirm({
    title: 'Elimini la bozza?',
    description: 'Il testo e i destinatari scelti si perdono. Nessuna email è partita.',
    confirmLabel: 'Elimina la bozza',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/api/admin/communications/${draftId.value}`, { method: 'DELETE' })
    notifySuccess('Bozza eliminata')
    await navigateTo('/admin/comunicazioni')
  } catch (error) {
    notifyError(error)
  }
}

const sendLabel = computed(() => (count.value ? `Invia a ${plural(count.value, 'persona', 'persone')}` : 'Invia'))
</script>

<template>
  <IcPage :title="draftId ? 'Bozza di messaggio' : 'Nuovo messaggio'" back="/admin/comunicazioni" width="wide">
    <UForm
      :schema="communicationSchema"
      :state="state"
      class="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]"
      @submit="send"
    >
      <div class="min-w-0 lg:col-start-1">
        <IcSection
          title="Destinatari"
          description="Ricevono l’email solo gli account attivi con l’indirizzo confermato, una volta sola anche se compaiono più volte."
        >
          <CommunicationsAudiencePicker v-model="audienceDraft" :sessions="options?.sessions ?? []" />

          <div
            class="mt-6 rounded-lg border border-default bg-elevated p-4"
            role="status"
            aria-live="polite"
            :aria-busy="counting"
          >
            <p v-if="missing" class="text-muted">{{ missing }}</p>
            <template v-else-if="summary">
              <p class="flex items-center gap-2 font-semibold text-highlighted">
                <UIcon name="i-lucide-users-round" class="size-5 shrink-0 text-primary" aria-hidden="true" />
                {{
                  summary.count
                    ? `Riceveranno l’email ${plural(summary.count, 'persona', 'persone')}`
                    : 'Nessuno riceverà l’email'
                }}
              </p>
              <p class="mt-1 text-sm text-muted">{{ summary.label }}</p>
              <p v-if="summary.excluded" class="mt-1 text-sm text-muted">
                {{
                  summary.excluded === 1
                    ? '1 account escluso: disattivato, invito non accettato o indirizzo non confermato.'
                    : `${summary.excluded} account esclusi: disattivati, invito non accettato o indirizzo non confermato.`
                }}
              </p>
              <UCollapsible v-if="summary.count" class="mt-3">
                <UButton
                  label="Mostra i destinatari"
                  color="neutral"
                  variant="link"
                  trailing-icon="i-lucide-chevron-down"
                  class="px-0"
                  :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
                />
                <template #content>
                  <ul class="mt-2 max-h-72 divide-y divide-default overflow-y-auto text-sm">
                    <li v-for="person in summary.recipients" :key="person.userId" class="py-2">
                      <span class="font-semibold text-highlighted">{{ person.name }}</span>
                      <span class="block text-muted">{{ person.email }}</span>
                    </li>
                  </ul>
                </template>
              </UCollapsible>
            </template>
            <p v-else class="text-muted">Conto i destinatari…</p>
          </div>
        </IcSection>

        <IcSection
          title="Messaggio"
          description="Testo semplice: una riga vuota separa i paragrafi. Non scrivere dettagli sulla salute delle persone."
        >
          <div class="space-y-5">
            <UDropdownMenu v-if="templateItems.length" :items="templateItems" :content="{ align: 'start' }">
              <UButton
                label="Parti da un modello"
                icon="i-lucide-file-text"
                trailing-icon="i-lucide-chevron-down"
                color="neutral"
                variant="outline"
              />
            </UDropdownMenu>
            <UFormField label="Oggetto" name="subject" required>
              <UInput v-model="state.subject" maxlength="200" class="w-full" />
            </UFormField>
            <UFormField label="Testo" name="body" required :help="MESSAGE_FIELDS_HELP">
              <UTextarea v-model="state.body" :rows="10" autoresize :maxrows="30" class="w-full" />
            </UFormField>
          </div>
        </IcSection>
      </div>

      <aside
        class="min-w-0 lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
        aria-label="Anteprima dell’email"
      >
        <IcSection
          title="Anteprima"
          :description="
            firstRecipient
              ? `Così arriva nella casella di posta di ${firstRecipient.name}.`
              : 'Così arriva nella casella di posta.'
          "
        >
          <CommunicationsEmailFrame v-if="preview" :html="preview.html" title="Anteprima dell’email" />
          <USkeleton v-else class="h-96 w-full" />
        </IcSection>
      </aside>
      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-default pt-6 lg:col-start-1">
        <UButton
          v-if="draftId"
          label="Elimina la bozza"
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          class="me-auto"
          @click="deleteDraft"
        />
        <UButton
          :label="draftId ? 'Salva la bozza' : 'Salva come bozza'"
          color="neutral"
          variant="outline"
          :loading="saving"
          @click="saveDraft"
        />
        <UButton type="submit" icon="i-lucide-send" :label="sendLabel" :loading="sending" />
      </div>
    </UForm>
  </IcPage>
</template>
