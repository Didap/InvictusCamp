<script setup lang="ts">
import { z } from 'zod'
import { zReadConsent, zSignedName } from '#shared/schemas/documents'
import type { SignatureCodeState, SignaturePage } from '#shared/types/documents'
import { LOCALE, TIME_ZONE, enumLabel } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDateTime, formatDay } from '#shared/utils/format'

// Signing a document (docs/spec.md 3.6), only for the person it is assigned to: read it, tick the
// consent, type the full name, ask for the code (6 digits by email, 10 minutes, 5 attempts, a new one
// after 60 seconds), enter it and sign. A document to read is confirmed with the tick alone.
const route = useRoute()
const api = useApi()
const { user } = useUserSession()
const requestId = computed(() => String(route.params.id))
const { data: page, error, refresh } = await useApiFetch<SignaturePage>(() => `/api/signatures/${requestId.value}`)

const back = computed(() =>
  user.value?.role === 'staff'
    ? '/staff/documenti'
    : user.value?.role === 'admin'
      ? '/admin/documenti'
      : '/famiglia/documenti',
)
const doc = computed(() => page.value?.document)
const fileUrl = computed(() => (doc.value ? `/api/files/${doc.value.file.id}` : ''))
const copyUrl = computed(() => `/api/signatures/${requestId.value}/copy`)

const form = reactive({ consent: false, name: '', code: [] as (number | undefined)[] })
const codeState = ref<SignatureCodeState | null>(null)
watch(
  () => page.value?.code,
  value => {
    codeState.value = value ?? null
  },
  { immediate: true },
)
const codeError = ref('')
const sending = ref(false)
const working = ref(false)
const outcome = useTemplateRef<HTMLElement>('outcome')

/** After signing, the panel is still scrolled down at the form: bring the outcome into view and focus. */
async function showOutcome() {
  await nextTick()
  outcome.value?.scrollIntoView({ block: 'start' })
  outcome.value?.focus({ preventScroll: true })
}

const now = ref(Date.now())
useIntervalFn(() => {
  now.value = Date.now()
}, 1000)
const resendIn = computed(() =>
  codeState.value ? Math.max(0, Math.ceil((Date.parse(codeState.value.resendAt) - now.value) / 1000)) : 0,
)
const codeExpired = computed(() => !!codeState.value && Date.parse(codeState.value.expiresAt) <= now.value)
const codeString = computed(() => form.code.map(digit => (digit === undefined ? '' : String(digit))).join(''))
const expiresAtTime = computed(() =>
  codeState.value
    ? new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }).format(
        new Date(codeState.value.expiresAt),
      )
    : '',
)

const detailsSchema = z.object({ consent: zReadConsent, name: zSignedName })
const signSchema = detailsSchema.extend({
  code: z.array(z.number().optional()).refine(digits => digits.filter(digit => digit !== undefined).length === 6, {
    error: 'Inserisci le 6 cifre del codice',
  }),
})
const readSchema = z.object({ consent: zReadConsent })
const schema = computed(() => (codeState.value ? signSchema : detailsSchema))

const overdue = computed(() => !!page.value?.dueDate && page.value.dueDate < todayIso())

async function sendCode() {
  sending.value = true
  codeError.value = ''
  try {
    codeState.value = await api<SignatureCodeState>(`/api/signatures/${requestId.value}/code`, { method: 'POST' })
    form.code = []
    notifySuccess('Codice inviato', `Controlla la casella di ${page.value?.email}, anche nella posta indesiderata.`)
  } catch (error) {
    notifyError(error, 'Codice non inviato')
    if ((error as { statusCode?: number }).statusCode === 409) await refresh()
  } finally {
    sending.value = false
  }
}

async function sign() {
  working.value = true
  codeError.value = ''
  try {
    page.value = await api<SignaturePage>(`/api/signatures/${requestId.value}/sign`, {
      method: 'POST',
      body: { consent: form.consent, name: form.name, code: codeString.value },
    })
    notifySuccess('Documento firmato', 'Ti abbiamo inviato una email di conferma.')
    await showOutcome()
    await refreshNuxtData('my-signatures')
  } catch (error) {
    const data = apiErrorData(error) as { reason?: string } | undefined
    if (data?.reason) {
      codeError.value = apiErrorMessage(error)
      form.code = []
    } else {
      notifyError(error, 'Firma non riuscita')
      // Signed or cancelled meanwhile (another tab, the administration): show the current state.
      if ((error as { statusCode?: number }).statusCode === 409) await refresh()
    }
  } finally {
    working.value = false
  }
}

function onSubmit() {
  return codeState.value ? sign() : sendCode()
}

async function confirmRead() {
  working.value = true
  try {
    page.value = await api<SignaturePage>(`/api/signatures/${requestId.value}/read`, {
      method: 'POST',
      body: { consent: form.consent },
    })
    notifySuccess('Lettura confermata')
    await showOutcome()
    await refreshNuxtData('my-signatures')
  } catch (error) {
    notifyError(error, 'Conferma non riuscita')
    if ((error as { statusCode?: number }).statusCode === 409) await refresh()
  } finally {
    working.value = false
  }
}
</script>

<template>
  <IcPage :title="doc?.title ?? 'Documento'" :back="back" width="narrow">
    <UEmpty
      v-if="error || !page || !doc"
      icon="i-lucide-file-x"
      title="Documento non trovato"
      description="Il link potrebbe non essere più valido, oppure il documento è assegnato a un’altra persona. Trovi i tuoi documenti nella pagina Documenti."
      :actions="[{ label: 'Vai ai tuoi documenti', to: back, icon: 'i-lucide-folder-open' }]"
    />

    <template v-else>
      <div class="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2">
        <DocumentsSignatureStatusBadge :status="page.status" :requires-signature="doc.requiresSignature" />
        <span class="text-sm text-muted">{{ enumLabel('documentCategory', doc.category) }}</span>
        <span
          v-if="page.status === 'pending' && page.dueDate"
          class="text-sm"
          :class="overdue ? 'font-semibold text-warning' : 'text-muted'"
        >
          {{ overdue ? 'La scadenza era il' : 'Entro il' }} {{ formatDay(page.dueDate, 'long') }}
        </span>
      </div>

      <!-- Signed (or read): the outcome and the signed copy -->
      <div v-if="page.status === 'signed'" ref="outcome" tabindex="-1" class="scroll-mt-6 outline-none">
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          :title="doc.requiresSignature ? 'Hai firmato il documento' : 'Hai confermato la lettura'"
          :description="
            doc.requiresSignature
              ? `Il ${formatDateTime(page.signedAt)}, con il nome «${page.signedName}». La copia firmata ha in fondo una pagina che certifica la firma.`
              : `Il ${formatDateTime(page.signedAt)}.`
          "
        />
        <div v-if="doc.requiresSignature" class="mt-6 flex flex-wrap gap-3">
          <UButton :href="`${copyUrl}?download`" external icon="i-lucide-download" label="Scarica la copia firmata" />
          <UButton
            :href="copyUrl"
            external
            target="_blank"
            color="neutral"
            variant="outline"
            icon="i-lucide-external-link"
            label="Aprila in una nuova scheda"
            class="max-sm:hidden"
          />
        </div>
        <IcSection title="Il documento" class="mt-10">
          <IcPdfViewer
            :src="doc.requiresSignature ? copyUrl : fileUrl"
            :title="doc.requiresSignature ? `Copia firmata di ${doc.title}` : doc.title"
          />
        </IcSection>
        <UButton :to="back" color="neutral" variant="link" icon="i-lucide-arrow-left" label="Torna ai tuoi documenti" />
      </div>

      <UAlert
        v-else-if="page.status === 'cancelled'"
        color="neutral"
        variant="subtle"
        icon="i-lucide-ban"
        title="Non serve più firmare questo documento"
        description="L’amministrazione ha annullato la richiesta. Se hai dubbi, scrivi al camp."
        :actions="[{ label: 'Torna ai tuoi documenti', to: back, color: 'neutral', variant: 'outline' }]"
      />

      <!-- To sign or to read -->
      <template v-else>
        <p class="mb-8 max-w-prose text-muted">
          <template v-if="doc.requiresSignature">
            Leggi il documento fino in fondo. Poi, qui sotto, conferma di averlo letto, scrivi il tuo nome e cognome e
            chiedi il codice: te lo inviamo via email e vale come firma.
          </template>
          <template v-else>Leggi il documento fino in fondo, poi conferma qui sotto di averlo letto.</template>
        </p>

        <IcSection title="Il documento" :description="doc.description ?? undefined">
          <IcPdfViewer :src="fileUrl" :title="doc.title" />
        </IcSection>

        <IcSection
          v-if="doc.requiresSignature"
          title="Firma"
          description="Firma elettronica semplice: il codice che ricevi via email conferma che sei proprio tu."
        >
          <UForm :schema="schema" :state="form" class="max-w-xl space-y-6" @submit="onSubmit">
            <UFormField name="consent">
              <UCheckbox
                v-model="form.consent"
                label="Ho letto il documento e lo accetto"
                required
                :ui="{ label: 'font-semibold', base: 'size-5', container: 'h-6' }"
              />
            </UFormField>
            <UFormField
              label="Il tuo nome e cognome"
              name="name"
              :help="`Scrivili per esteso: valgono come firma. Il tuo account è a nome di ${page.accountName}.`"
              required
            >
              <UInput v-model="form.name" autocomplete="name" size="lg" class="w-full" />
            </UFormField>

            <template v-if="!codeState">
              <p class="text-sm text-muted">
                Ti invieremo un codice di 6 cifre a <strong class="text-highlighted">{{ page.email }}</strong
                >. Vale 10 minuti.
              </p>
              <UButton type="submit" size="lg" icon="i-lucide-mail" label="Invia il codice" :loading="sending" />
            </template>

            <template v-else>
              <UFormField
                label="Il codice che hai ricevuto"
                name="code"
                :error="codeError || undefined"
                :help="
                  codeExpired
                    ? 'Il codice è scaduto: chiedine uno nuovo.'
                    : `Lo abbiamo inviato a ${page.email}. Vale fino alle ${expiresAtTime}.`
                "
                required
              >
                <UPinInput
                  v-model="form.code"
                  :length="6"
                  type="number"
                  otp
                  autofocus
                  size="xl"
                  :ui="{ root: 'gap-2', base: 'size-12 text-xl font-mono' }"
                />
              </UFormField>
              <div class="flex flex-wrap items-center gap-3">
                <UButton
                  type="submit"
                  size="lg"
                  icon="i-lucide-signature"
                  label="Firma il documento"
                  :loading="working"
                  :disabled="codeExpired"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  size="lg"
                  :disabled="resendIn > 0"
                  :loading="sending"
                  :label="resendIn > 0 ? `Nuovo codice tra ${resendIn} s` : 'Invia un nuovo codice'"
                  @click="sendCode"
                />
              </div>
            </template>
          </UForm>
        </IcSection>

        <IcSection v-else title="Conferma la lettura">
          <UForm :schema="readSchema" :state="form" class="max-w-xl space-y-6" @submit="confirmRead">
            <UFormField name="consent">
              <UCheckbox
                v-model="form.consent"
                label="Ho letto il documento"
                required
                :ui="{ label: 'font-semibold', base: 'size-5', container: 'h-6' }"
              />
            </UFormField>
            <UButton
              type="submit"
              size="lg"
              icon="i-lucide-book-check"
              label="Conferma la lettura"
              :loading="working"
            />
          </UForm>
        </IcSection>
      </template>
    </template>
  </IcPage>
</template>
