<script setup lang="ts">
import { isSheetComplete, SHEET_MISSING, staffSheetSchema } from '#shared/schemas/staff'
import type {
  StaffSheet,
  StaffSheetDto,
  StaffSheetSaved,
  StaffSheetSignature,
  StaffUsefulInfoDto,
} from '#shared/types/staff'
import { residenceForm } from '#shared/schemas/common'
import { SHIRT_SIZES } from '#shared/utils/constants'
import { ageOn, isIsoDay, todayIso } from '#shared/utils/dates'
import { formatAge, formatDateTime, formatDay } from '#shared/utils/format'
import { focusFirstError } from '~/utils/errors'

// The personal sheet of an approved staff or v-team member (docs/spec.md 3.4): name, email and phone are the
// account's (changed from /account); birth, codice fiscale, residence and T-shirt size to fill in; allergies and
// the other details under the consent to health data (StaffUsefulInfo); the application as it was sent. Once
// complete, the PDF of the sheet to sign (server/domain/staff-sheets.ts): made again when the data changes.
const api = useApi()
const { label } = useEnums()
const { data } = await useApiFetch<StaffSheetDto>('/api/staff/sheet')

const today = todayIso()
/** The sheet as the form holds it: '' for an empty text, nothing chosen. */
function sheetForm(sheet: StaffSheet | undefined) {
  return {
    birthDate: sheet?.birthDate ?? '',
    birthPlace: sheet?.birthPlace ?? '',
    fiscalCode: sheet?.fiscalCode ?? '',
    ...residenceForm(sheet),
    shirtSize: sheet?.shirtSize ?? undefined,
  }
}
// Loaded once: a save updates `data` without overwriting what is being typed.
const state = reactive(sheetForm(data.value?.sheet))

const complete = computed(() => !data.value || isSheetComplete(data.value.sheet))
const signature = computed(() => data.value?.signature ?? null)
/** The age counts itself from the date being typed. */
const age = computed(() =>
  isIsoDay(state.birthDate) && state.birthDate <= today
    ? `Hai ${formatAge(ageOn(state.birthDate, today))}.`
    : undefined,
)

const account = computed(() => {
  const a = data.value?.account
  if (!a) return []
  return [
    { label: 'Nome', value: a.firstName },
    { label: 'Cognome', value: a.lastName },
    { label: 'Email', value: a.email },
    { label: 'Telefono', value: a.phone },
  ]
})

/** Someone the administration invited as approved never applied: no section for them. */
const application = computed(() => (data.value?.application.appliedAt ? data.value.application : null))
// Only what the person wrote: an application sent with the CV alone has no texts.
const texts = computed(() => {
  const a = application.value
  if (!a) return []
  return [
    { label: 'Titoli e qualifiche', value: a.qualifications },
    { label: 'Esperienze', value: a.experience },
    { label: 'Motivazione', value: a.motivation },
  ].filter(item => item.value)
})
const sentOn = computed(() => {
  const at = application.value?.appliedAt
  return at ? `Inviata il ${formatDay(todayIso(new Date(at)), 'long')}` : undefined
})

/** StaffUsefulInfo saved the health data: `data` is shallow, so a new object. */
function onHealth(health: StaffUsefulInfoDto) {
  if (data.value) data.value = { ...data.value, health }
}

/** The sheet as the server keeps it, to tell a change from a different spelling (a lower-case codice fiscale). */
const normalized = (value: unknown) => JSON.stringify(staffSheetSchema.safeParse(value).data)
const confirm = useConfirm()
const saving = ref(false)

/** The signature after a save: a new PDF to sign brings the person to «Leggi e firma». */
async function showSignature(next: StaffSheetSignature | null, title: string) {
  const renewed = next?.status === 'pending' && next.id !== signature.value?.id
  // `data` is shallow: a new object, so what reads it sees the change.
  if (data.value) data.value = { ...data.value, signature: next }
  if (!renewed) return notifySuccess(title)
  notifySuccess(title, 'Abbiamo preparato il PDF con i tuoi dati: ora firmalo.')
  await nextTick()
  document.querySelector<HTMLElement>('#firma-scheda a')?.focus()
}

async function save() {
  if (
    signature.value?.status === 'signed' &&
    normalized(state) !== normalized(sheetForm(data.value?.sheet)) &&
    !(await confirm({
      title: 'Dovrai firmare di nuovo la scheda',
      description:
        'Hai già firmato la scheda: con i dati nuovi prepariamo un altro PDF da firmare e ti mandiamo un’email.',
      confirmLabel: 'Salva le modifiche',
    }))
  ) {
    return
  }
  saving.value = true
  try {
    const result = await api<StaffSheetSaved>('/api/staff/sheet', { method: 'PUT', body: state })
    if (data.value) data.value = { ...data.value, sheet: result.sheet }
    Object.assign(state, sheetForm(result.sheet))
    await showSignature(result.signature, 'Scheda salvata')
  } catch (error) {
    notifyError(error, 'Scheda non salvata')
  } finally {
    saving.value = false
  }
}

/** A complete sheet with no PDF in force: saved before the PDFs came, or archived by the administration. */
async function preparePdf() {
  saving.value = true
  try {
    const next = await api<StaffSheetSignature | null>('/api/staff/sheet/document', { method: 'POST' })
    await showSignature(next, 'PDF preparato')
  } catch (error) {
    notifyError(error, 'PDF non preparato')
  } finally {
    saving.value = false
  }
}

/** «Firma la tua scheda»: the PDF to read and sign, or to prepare. */
const signPrompt = computed(() => {
  const style = { class: 'pointer-coarse:min-h-11', color: 'neutral', variant: 'outline' } as const
  const id = signature.value?.id
  return id
    ? {
        description:
          'Abbiamo preparato il PDF con i dati che hai salvato. Leggilo e firmalo: per confermare ti mandiamo un codice via email.',
        action: { ...style, label: 'Leggi e firma', to: `/firma/${id}` },
      }
    : {
        description:
          'Prepariamo il PDF con i dati che hai salvato: poi lo leggi e lo firmi con il codice che ti mandiamo via email.',
        action: { ...style, label: 'Prepara il PDF da firmare', loading: saving.value, onClick: preparePdf },
      }
})
</script>

<template>
  <IcPage title="Scheda personale" width="narrow">
    <template v-if="data">
      <UAlert
        v-if="!complete"
        class="mb-8"
        color="warning"
        variant="subtle"
        icon="i-lucide-id-card"
        title="Completa la tua scheda"
        :description="SHEET_MISSING"
      />
      <UAlert
        v-else-if="signature?.status !== 'signed'"
        id="firma-scheda"
        class="mb-8"
        color="warning"
        variant="subtle"
        icon="i-lucide-pen-line"
        title="Firma la tua scheda"
        :description="signPrompt.description"
        :actions="[signPrompt.action]"
      />
      <p v-else class="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        <span class="inline-flex items-center gap-2">
          <IcStatusBadge kind="signatureStatus" value="signed" />
          il {{ formatDateTime(signature.signedAt) }}
        </span>
        <ULink :to="`/firma/${signature.id}`" class="font-semibold text-primary underline">Vedi la copia firmata</ULink>
      </p>

      <IcSection title="I tuoi dati">
        <IcDataList :items="account" :columns="2" />
        <p class="mt-4 text-sm text-muted">
          Nome, cognome e telefono li cambi da
          <ULink to="/account" class="font-semibold text-primary underline">Account</ULink>.
        </p>
      </IcSection>

      <UForm :schema="staffSheetSchema" :state="state" @submit="save" @error="focusFirstError">
        <IcSection title="Nascita e codice fiscale">
          <div class="space-y-5">
            <div class="grid gap-5 sm:grid-cols-2">
              <UFormField label="Data di nascita" name="birthDate" required :help="age">
                <UInput v-model="state.birthDate" type="date" :max="today" min="1900-01-01" class="w-full" />
              </UFormField>
              <UFormField label="Luogo di nascita" name="birthPlace" required>
                <UInput v-model="state.birthPlace" class="w-full" />
              </UFormField>
            </div>
            <UFormField label="Codice fiscale" name="fiscalCode" required>
              <UInput
                v-model="state.fiscalCode"
                maxlength="20"
                autocomplete="off"
                spellcheck="false"
                class="w-full sm:max-w-xs"
                :ui="{ base: 'uppercase' }"
              />
            </UFormField>
          </div>
        </IcSection>

        <IcSection title="Residenza">
          <IcResidenceFields v-model="state" required />
        </IcSection>

        <IcSection title="Divisa">
          <UFormField label="Taglia della maglietta" name="shirtSize" required help="Ci serve per la divisa del camp.">
            <USelect
              v-model="state.shirtSize"
              :items="[...SHIRT_SIZES]"
              placeholder="Scegli"
              class="w-full sm:max-w-40"
            />
          </UFormField>
        </IcSection>

        <div class="flex justify-end">
          <UButton type="submit" label="Salva la scheda" :loading="saving" class="pointer-coarse:min-h-11" />
        </div>
      </UForm>

      <IcSection
        class="mt-10"
        title="Alimentazione e altre informazioni"
        description="Allergie e preferenze arrivano alla mensa delle sessioni a cui partecipi. Il resto lo legge solo l’amministrazione."
      >
        <StaffUsefulInfo :model-value="data.health" @update:model-value="onHealth" />
      </IcSection>

      <IcSection v-if="application" title="Candidatura" :description="sentOn">
        <div class="space-y-6">
          <IcDataList :items="[{ label: 'Squadra', value: label('staffTeam', application.team) }]" />
          <div v-if="application.roles.length">
            <h3 class="text-sm font-semibold text-muted">Ruoli</h3>
            <ul class="mt-2 flex flex-wrap gap-2">
              <li v-for="role in application.roles" :key="role.id">
                <UBadge :label="role.name" color="neutral" variant="outline" size="lg" />
              </li>
            </ul>
          </div>
          <dl v-if="texts.length" class="space-y-5">
            <div v-for="item in texts" :key="item.label">
              <dt class="text-sm font-semibold text-muted">{{ item.label }}</dt>
              <dd class="mt-1 max-w-prose whitespace-pre-line">{{ item.value }}</dd>
            </div>
          </dl>
          <div>
            <h3 class="text-sm font-semibold text-muted">Curriculum</h3>
            <IcFileLink v-if="application.cv" :file="application.cv" class="mt-2" />
            <p v-else class="mt-1 text-dimmed">Non caricato</p>
          </div>
        </div>
      </IcSection>
    </template>
  </IcPage>
</template>
