<script setup lang="ts">
import {
  hasStaffHealth,
  isSheetComplete,
  sheetMissing,
  staffHealthChanges,
  staffHealthForm,
  staffSheetFormSchema,
  staffSheetSchema,
} from '#shared/schemas/staff'
import type {
  StaffSheet,
  StaffSheetDto,
  StaffSheetSaved,
  StaffSheetSignature,
  StaffUsefulInfoDto,
} from '#shared/types/staff'
import { residenceForm } from '#shared/schemas/common'
import { SHIRT_SIZES, STAFF_CONTRACTS, type StaffContract } from '#shared/utils/constants'
import { ageOn, isIsoDay, todayIso } from '#shared/utils/dates'
import { formatAge, formatDateTime } from '#shared/utils/format'
import { focusFirstError } from '~/utils/errors'

// The personal sheet of an approved staff or v-team member (docs/spec.md 3.4): name, email and phone are the
// account's (changed from /account); «Altri dati anagrafici» (birth, codice fiscale, residence) and «Info utili per
// la nostra collaborazione» (T-shirt size, the staff's contract formula, the health data under the consent) in one
// form, saved together. Once complete, the PDF of the sheet to sign (server/domain/staff-sheets.ts): made again when
// its data changes; the health data never goes in it.
const api = useApi()
const { data } = await useApiFetch<StaffSheetDto>('/api/staff/sheet')

const NO_HEALTH: StaffUsefulInfoDto = { info: null, nonFoodAllergies: null, otherInfo: null, consentAt: null }
const team = computed(() => data.value?.team ?? 'staff')
const stored = computed(() => data.value?.health ?? NO_HEALTH)
const schema = computed(() => staffSheetFormSchema(team.value, stored.value))
const today = todayIso()

/** The sheet as the form holds it: '' for an empty text, nothing chosen. */
function sheetForm(sheet: StaffSheet | undefined) {
  return {
    birthDate: sheet?.birthDate ?? '',
    birthPlace: sheet?.birthPlace ?? '',
    fiscalCode: sheet?.fiscalCode ?? '',
    ...residenceForm(sheet),
    shirtSize: sheet?.shirtSize ?? undefined,
    contractType: sheet?.contractType ?? undefined,
  }
}
// Loaded once: a save updates `data` without overwriting what is being typed.
const state = reactive({ ...sheetForm(data.value?.sheet), health: staffHealthForm(stored.value) })
/** The health answers differ from the ones saved: the consent box comes back. */
const healthChanged = computed(() => staffHealthChanges(stored.value, state.health).length > 0)
/** Bumped when the health answers are replaced from the server: the fields start again from them. */
const healthKey = ref(0)
function resetHealth(health: StaffUsefulInfoDto) {
  state.health = staffHealthForm(health)
  healthKey.value++
}

const complete = computed(() => !data.value || isSheetComplete(data.value.sheet, team.value))
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

const SIZE_ITEMS = SHIRT_SIZES.map(size => ({ value: size, label: size }))
/** The formula as the person says it (the admin pages and the PDF use ENUM_META.staffContract). */
const CONTRACT_CHOICE: Record<StaffContract, string> = {
  vat_number: 'Ho partita IVA',
  occasional: 'Collaborazione occasionale',
}
const CONTRACT_ITEMS = STAFF_CONTRACTS.map(value => ({ value, label: CONTRACT_CHOICE[value] }))
const HORIZONTAL = { legend: 'sr-only', fieldset: 'flex-wrap gap-x-5 gap-y-3' }

/** The sheet as the server keeps it, to tell a change from a different spelling (a lower-case codice fiscale). */
const normalized = (value: unknown) => JSON.stringify(staffSheetSchema(team.value).safeParse(value).data)
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
  // Health data the person had and the form no longer has: deleted, with the consent.
  if (
    data.value?.health.consentAt &&
    !hasStaffHealth(state.health) &&
    !(await confirm({
      title: 'Cancellare allergie e altre informazioni?',
      description: 'Le informazioni che avevi indicato vengono cancellate e il consenso viene ritirato.',
      confirmLabel: 'Cancella e salva',
      danger: true,
    }))
  ) {
    return
  }
  saving.value = true
  try {
    const result = await api<StaffSheetSaved>('/api/staff/sheet', { method: 'PUT', body: state })
    if (data.value) data.value = { ...data.value, sheet: result.sheet, health: result.health }
    Object.assign(state, sheetForm(result.sheet))
    resetHealth(result.health)
    await showSignature(result.signature, 'Scheda salvata')
  } catch (error) {
    notifyError(error, 'Scheda non salvata')
  } finally {
    saving.value = false
  }
}

/** Withdraws the consent and deletes the health data at once, whatever the rest of the sheet. */
const withdrawing = ref(false)
async function withdraw() {
  const ok = await confirm({
    title: 'Ritirare il consenso?',
    description: 'Allergie, preferenze e le altre informazioni che hai indicato vengono cancellate.',
    confirmLabel: 'Cancella e ritira il consenso',
    danger: true,
  })
  if (!ok) return
  withdrawing.value = true
  try {
    const health = await api<StaffUsefulInfoDto>('/api/staff/useful-info', { method: 'DELETE' })
    if (data.value) data.value = { ...data.value, health }
    resetHealth(health)
    notifySuccess('Consenso ritirato', 'Le informazioni sono state cancellate.')
  } catch (error) {
    notifyError(error, 'Consenso non ritirato')
  } finally {
    withdrawing.value = false
  }
}

/** A complete sheet with no PDF in force: saved before the PDFs came, or archived from the admin pages. */
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
        :description="sheetMissing(team)"
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

      <UForm :schema="schema" :state="state" @submit="save" @error="focusFirstError">
        <IcSection title="Altri dati anagrafici">
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
            <IcResidenceFields v-model="state" required />
          </div>
        </IcSection>

        <IcSection
          title="Info utili per la nostra collaborazione"
          description="Allergie, intolleranze e preferenze alimentari arrivano con il tuo nome a chi prepara i pasti delle sessioni a cui partecipi. Le altre informazioni le leggono solo gli organizzatori del camp e non finiscono mai nel PDF della scheda."
        >
          <div class="space-y-6">
            <UFormField
              label="Qual è la taglia che ti senti più comoda?"
              name="shirtSize"
              required
              help="Ci occorre per preparare la tua divisa."
            >
              <URadioGroup
                v-model="state.shirtSize"
                :items="SIZE_ITEMS"
                legend="Taglia"
                orientation="horizontal"
                :ui="HORIZONTAL"
              />
            </UFormField>
            <UFormField v-if="team === 'staff'" label="Formula contrattuale" name="contractType" required>
              <URadioGroup
                v-model="state.contractType"
                :items="CONTRACT_ITEMS"
                legend="Formula contrattuale"
                orientation="horizontal"
                :ui="HORIZONTAL"
              />
            </UFormField>
            <StaffHealthFields
              :key="healthKey"
              v-model="state.health"
              :consent-at="data.health.consentAt"
              :changed="healthChanged"
            />
            <UButton
              v-if="data.health.consentAt"
              label="Cancella queste informazioni e ritira il consenso"
              color="error"
              variant="ghost"
              :loading="withdrawing"
              class="-ms-2.5 pointer-coarse:min-h-11"
              @click="withdraw"
            />
          </div>
        </IcSection>

        <div class="flex justify-end">
          <UButton type="submit" label="Salva la scheda" :loading="saving" class="pointer-coarse:min-h-11" />
        </div>
      </UForm>
    </template>
  </IcPage>
</template>
