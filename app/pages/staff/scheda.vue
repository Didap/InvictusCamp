<script setup lang="ts">
import { isSheetComplete, staffSheetSchema } from '#shared/schemas/staff'
import type { StaffSheet, StaffSheetDto } from '#shared/types/staff'
import { SHIRT_SIZES, type ItalianRegion, type ShirtSize } from '#shared/utils/constants'
import { ageOn, isIsoDay, todayIso } from '#shared/utils/dates'
import { formatAge, formatDay } from '#shared/utils/format'
import { focusFirstError } from '~/utils/errors'

// The personal sheet of an approved staff or v-team member (docs/spec.md 3.4): name, email and phone are the
// account's (changed from /account); birth, codice fiscale, residence and T-shirt size to fill in; allergies and
// the other details under the consent to health data (StaffUsefulInfo); the application as it was sent.
const api = useApi()
const { label } = useEnums()
const { data } = await useApiFetch<StaffSheetDto>('/api/staff/sheet')

const today = todayIso()
const state = reactive({
  birthDate: '',
  birthPlace: '',
  fiscalCode: '',
  address: '',
  city: '',
  postalCode: '',
  province: '',
  region: undefined as ItalianRegion | undefined,
  shirtSize: undefined as ShirtSize | undefined,
})

function fill(sheet: StaffSheet) {
  Object.assign(state, {
    birthDate: sheet.birthDate ?? '',
    birthPlace: sheet.birthPlace ?? '',
    fiscalCode: sheet.fiscalCode ?? '',
    address: sheet.address ?? '',
    city: sheet.city ?? '',
    postalCode: sheet.postalCode ?? '',
    province: sheet.province ?? '',
    region: sheet.region ?? undefined,
    shirtSize: sheet.shirtSize ?? undefined,
  })
}
// Loaded once: a save updates `data` without overwriting what is being typed.
if (data.value) fill(data.value.sheet)

const complete = computed(() => (data.value ? isSheetComplete(data.value.sheet) : true))
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

const application = computed(() => data.value?.application)
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

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const sheet = await api<StaffSheet>('/api/staff/sheet', { method: 'PUT', body: state })
    if (data.value) data.value.sheet = sheet
    fill(sheet)
    notifySuccess('Scheda salvata')
  } catch (error) {
    notifyError(error, 'Scheda non salvata')
  } finally {
    saving.value = false
  }
}
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
        description="Ci servono la data e il luogo di nascita, il codice fiscale, la residenza e la taglia della maglietta."
      />

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
              <UFormField label="Data di nascita" name="birthDate" data-field="birthDate" required :help="age">
                <UInput v-model="state.birthDate" type="date" :max="today" min="1900-01-01" class="w-full" />
              </UFormField>
              <UFormField label="Luogo di nascita" name="birthPlace" data-field="birthPlace" required>
                <UInput v-model="state.birthPlace" class="w-full" />
              </UFormField>
            </div>
            <UFormField label="Codice fiscale" name="fiscalCode" data-field="fiscalCode" required>
              <UInput
                v-model="state.fiscalCode"
                maxlength="20"
                autocomplete="off"
                spellcheck="false"
                class="w-full uppercase sm:max-w-xs"
              />
            </UFormField>
          </div>
        </IcSection>

        <IcSection title="Residenza">
          <IcResidenceFields v-model="state" required />
        </IcSection>

        <IcSection title="Divisa">
          <UFormField
            label="Taglia della maglietta"
            name="shirtSize"
            data-field="shirtSize"
            required
            help="Ci serve per la divisa del camp."
          >
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
        <StaffUsefulInfo />
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
