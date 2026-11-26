<script setup lang="ts">
import { emailTextsSchema } from '#shared/schemas/automatic-emails'
import type { AutomaticEmailDetail } from '#shared/types/automatic-emails'
import type { DeliveryReport, EmailPreview } from '#shared/types/communications'
import {
  automaticEmailDefinition,
  EMAIL_TEXT_LIMITS,
  emailFieldsHelp,
  hasEmailAction,
  isAutomaticEmailKey,
  type AutomaticEmailKey,
  type EmailTexts,
} from '#shared/utils/automatic-emails'
import { formatDateTime } from '#shared/utils/format'

// One automatic email (Comunicazioni › Automatiche): what makes it leave, its switch, its texts with the
// email previewed on the right as it arrives (real template, example data), a test to oneself, the send by
// hand and the way back to the starting texts.
const route = useRoute()
const api = useApi()
const confirm = useConfirm()

const key = computed(() => String(route.params.key))
const known = computed(() => isAutomaticEmailKey(key.value))
const { data, error } = await useApiFetch<AutomaticEmailDetail>(() => `/api/admin/automatic-emails/${key.value}`)

const email = computed(() => (known.value ? automaticEmailDefinition(key.value as AutomaticEmailKey) : null))
const emailKey = computed(() => key.value as AutomaticEmailKey)
const withButton = computed(() => known.value && hasEmailAction(emailKey.value))
const schema = computed(() => emailTextsSchema(emailKey.value))

const state = reactive<EmailTexts>({
  subject: '',
  preheader: '',
  title: '',
  greeting: '',
  body: '',
  actionLabel: '',
  after: '',
  footnote: '',
})
const saved = ref<EmailTexts | null>(null)
watch(
  () => data.value?.texts,
  texts => {
    if (!texts) return
    Object.assign(state, texts)
    saved.value = { ...texts }
  },
  { immediate: true },
)
const dirty = computed(
  () =>
    !!saved.value && (Object.keys(state) as (keyof EmailTexts)[]).some(field => state[field] !== saved.value![field]),
)
const differsFromDefaults = computed(
  () =>
    !!email.value &&
    (Object.keys(state) as (keyof EmailTexts)[]).some(field => state[field] !== email.value!.defaults[field]),
)

// ─── Preview ───────────────────────────────────────────────────────────────────────────────────────
const preview = ref<EmailPreview | null>(null)
let previewRequest = 0
watchDebounced(
  () => ({ ...state }),
  async texts => {
    if (!known.value || !saved.value) return
    const request = ++previewRequest
    try {
      const url: string = `/api/admin/automatic-emails/${key.value}/preview`
      const result = await api<EmailPreview>(url, { method: 'POST', body: texts })
      if (request === previewRequest) preview.value = result
    } catch {
      // The preview keeps the last good render; the form says what is wrong.
    }
  },
  { debounce: 300, deep: true, immediate: true },
)

// ─── Actions ───────────────────────────────────────────────────────────────────────────────────────
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const url: string = `/api/admin/automatic-emails/${key.value}`
    data.value = await api<AutomaticEmailDetail>(url, { method: 'PUT', body: { ...state } })
    notifySuccess('Testo salvato', 'Le prossime email partono con questo testo. Nessuna email è partita adesso.')
  } catch (error) {
    notifyError(error, 'Testo non salvato')
  } finally {
    saving.value = false
  }
}

async function restore() {
  const ok = await confirm({
    title: 'Rimetti il testo iniziale?',
    description:
      'Oggetto e testi tornano quelli di partenza e le prossime email partono così. Nessuna email parte adesso.',
    confirmLabel: 'Rimetti il testo iniziale',
  })
  if (!ok) return
  try {
    const url: string = `/api/admin/automatic-emails/${key.value}`
    data.value = await api<AutomaticEmailDetail>(url, { method: 'DELETE' })
    notifySuccess('Testo iniziale rimesso')
  } catch (error) {
    notifyError(error)
  }
}

const switching = ref(false)
async function setActive(active: boolean) {
  if (!email.value) return
  if (!active) {
    const ok = await confirm({
      title: `Spegni «${email.value.label}»?`,
      description: `Da adesso non parte più quando succede: nel registro la trovi come «Spenta».${email.value.manual ? ' Puoi sempre mandarla a mano.' : ''} Nessuna email parte adesso.`,
      confirmLabel: 'Spegni l’email',
    })
    if (!ok) return
  }
  switching.value = true
  try {
    const url: string = `/api/admin/automatic-emails/${key.value}/active`
    await api(url, { method: 'PUT', body: { active } })
    if (data.value) data.value = { ...data.value, active }
    notifySuccess(active ? 'Email accesa' : 'Email spenta')
  } catch (error) {
    notifyError(error)
  } finally {
    switching.value = false
  }
}

const { user } = useUserSession()
const testing = ref(false)
async function sendTest() {
  testing.value = true
  try {
    const url: string = `/api/admin/automatic-emails/${key.value}/test`
    const report = await api<DeliveryReport>(url, { method: 'POST', body: { ...state } })
    notifySuccess(`Prova inviata a ${user.value?.email ?? 'te'}`, deliveryOutcome(report))
  } catch (error) {
    notifyError(error, 'Prova non inviata')
  } finally {
    testing.value = false
  }
}

const sendOpen = ref(false)
const fieldsHelp = computed(() => (known.value ? emailFieldsHelp(emailKey.value) : ''))
const updated = computed(() =>
  data.value?.updatedAt
    ? `Ultima modifica il ${formatDateTime(data.value.updatedAt)}${data.value.updatedByName ? ` da ${data.value.updatedByName}` : ''}.`
    : null,
)
</script>

<template>
  <IcPage :title="email?.label ?? 'Email automatica'" back="/admin/comunicazioni?tab=automatiche" width="wide">
    <UEmpty
      v-if="error || !email"
      icon="i-lucide-mail-x"
      title="Email non trovata"
      description="Forse il link è sbagliato."
      :actions="[
        {
          label: 'Torna alle email automatiche',
          icon: 'i-lucide-arrow-left',
          to: '/admin/comunicazioni?tab=automatiche',
        },
      ]"
    />

    <UForm
      v-else-if="data"
      :schema="schema"
      :state="state"
      class="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]"
      @submit="save"
    >
      <div class="min-w-0 lg:col-start-1">
        <IcSection title="Quando parte">
          <dl class="space-y-3">
            <div>
              <dt class="text-sm text-muted">Evento</dt>
              <dd class="text-highlighted">{{ email.trigger }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">A chi</dt>
              <dd class="text-highlighted">{{ email.recipient }}</dd>
            </div>
          </dl>
          <div class="mt-5 rounded-lg border border-default bg-elevated p-4">
            <p v-if="email.alwaysOn" class="flex items-start gap-2 text-sm text-default">
              <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              <span><strong>Sempre attiva.</strong> {{ email.alwaysOn }}</span>
            </p>
            <template v-else>
              <USwitch
                :model-value="data.active"
                label="Attiva"
                :description="
                  data.active
                    ? 'Parte da sola quando succede l’evento.'
                    : 'Spenta: l’evento non la manda. Nel registro la trovi come «Spenta».'
                "
                :loading="switching"
                @update:model-value="setActive"
              />
            </template>
          </div>
        </IcSection>

        <IcSection
          title="Testo"
          description="Testo semplice: una riga vuota separa i paragrafi. I dati della sessione o del documento e l’indirizzo del pulsante li aggiunge il gestionale. Non scrivere dettagli sulla salute delle persone."
        >
          <div class="space-y-5">
            <UFormField label="Oggetto" name="subject" required>
              <UInput v-model="state.subject" :maxlength="EMAIL_TEXT_LIMITS.subject" class="w-full" />
            </UFormField>
            <UFormField
              label="Riga di anteprima"
              name="preheader"
              help="Alcune caselle di posta la mostrano accanto all’oggetto."
            >
              <UInput v-model="state.preheader" :maxlength="EMAIL_TEXT_LIMITS.preheader" class="w-full" />
            </UFormField>
            <UFormField label="Titolo" name="title" required>
              <UInput v-model="state.title" :maxlength="EMAIL_TEXT_LIMITS.title" class="w-full" />
            </UFormField>
            <UFormField label="Saluto" name="greeting">
              <UInput v-model="state.greeting" :maxlength="EMAIL_TEXT_LIMITS.greeting" class="w-full" />
            </UFormField>
            <UFormField
              label="Testo"
              name="body"
              required
              :help="
                key === 'staff.approved' || key === 'staff.rejected'
                  ? `${fieldsHelp} È il testo che ti proponiamo in «Comunica l’esito»: lì puoi ancora cambiarlo.`
                  : fieldsHelp
              "
            >
              <UTextarea v-model="state.body" :rows="8" autoresize :maxrows="24" class="w-full" />
            </UFormField>
            <UFormField v-if="withButton" label="Testo del pulsante" name="actionLabel" required>
              <UInput v-model="state.actionLabel" :maxlength="EMAIL_TEXT_LIMITS.actionLabel" class="w-full" />
            </UFormField>
            <UFormField :label="withButton ? 'Dopo il pulsante' : 'Chiusura'" name="after">
              <UTextarea v-model="state.after" :rows="2" autoresize :maxrows="10" class="w-full" />
            </UFormField>
            <UFormField label="Nota in fondo" name="footnote" help="In piccolo, sotto il riquadro dell’email.">
              <UTextarea v-model="state.footnote" :rows="2" autoresize :maxrows="6" class="w-full" />
            </UFormField>
          </div>
        </IcSection>
      </div>

      <aside
        class="min-w-0 lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
        aria-label="Anteprima dell’email"
      >
        <IcSection title="Anteprima" description="Così arriva, con dati di esempio. Si aggiorna mentre scrivi.">
          <template v-if="preview">
            <p class="mb-3 text-sm">
              <span class="text-muted">Oggetto: </span>
              <span class="font-semibold text-highlighted">{{ preview.subject }}</span>
            </p>
            <CommunicationsEmailFrame :html="preview.html" title="Anteprima dell’email" />
          </template>
          <USkeleton v-else class="h-96 w-full" />
        </IcSection>
      </aside>

      <div class="flex flex-col gap-3 border-t border-default pt-6 lg:col-start-1">
        <p v-if="updated" class="text-sm text-muted">{{ updated }}</p>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <UButton
            v-if="differsFromDefaults || data.customized"
            label="Rimetti il testo iniziale"
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            class="me-auto"
            @click="restore"
          />
          <UButton
            label="Invia una prova a me"
            icon="i-lucide-mail-check"
            color="neutral"
            variant="outline"
            :loading="testing"
            @click="sendTest"
          />
          <UButton
            v-if="email.manual"
            label="Invia a mano"
            icon="i-lucide-send"
            color="neutral"
            variant="outline"
            :disabled="dirty"
            :title="dirty ? 'Salva il testo prima di inviare' : undefined"
            @click="sendOpen = true"
          />
          <UButton type="submit" icon="i-lucide-save" label="Salva il testo" :loading="saving" :disabled="!dirty" />
        </div>
        <p v-if="email.manual && dirty" class="text-end text-sm text-muted">Salva il testo prima di inviarla a mano.</p>
      </div>
    </UForm>

    <CommunicationsManualSendModal v-if="email?.manual" v-model:open="sendOpen" :email-key="emailKey" />
  </IcPage>
</template>
