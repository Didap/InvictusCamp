<script setup lang="ts">
import type { FormError, FormErrorEvent } from '@nuxt/ui'
import { FAMILY_FORM_QUESTIONS, FAMILY_FORM_SECTIONS } from '#shared/content/family-form'
import {
  familyDataFieldsSchema,
  MAX_MEMBERS_OF_A_KIND,
  missingRequiredQuestions,
  type FamilyComposition,
} from '#shared/schemas/families'
import type { FormAnswers } from '#shared/types/domain'
import type { FamilyDataResult, FamilyProfileDto } from '#shared/types/families'
import { ITALIAN_REGIONS, type ItalianRegion } from '#shared/utils/constants'
import { formatDateTime, plural } from '#shared/utils/format'

// The family data (docs/spec.md, 3.8): the first form of the family, editable afterwards. Confirming it
// creates one card per person declared, filled in on /famiglia/membri. The composition never goes
// below the cards already there (the inputs stop at them): a person leaves by removing their card.
const api = useApi()
const { data: profile } = await useApiFetch<FamilyProfileDto>('/api/family/profile')

const submitted = computed(() => profile.value?.formStatus === 'submitted')
const cards = computed<FamilyComposition>(
  () => profile.value?.cards ?? { adults: 1, youngWithCondition: 0, youngWithoutCondition: 0 },
)

const state = reactive({
  name: '',
  phone: '',
  address: '',
  city: '',
  postalCode: '',
  province: '',
  region: undefined as ItalianRegion | undefined,
  composition: {} as Partial<FamilyComposition>,
  healthConsent: false,
})

// The answers to the questions: one record per kind of field, so every input gets a value of its own type.
const texts = reactive<Record<string, string>>({})
const choices = reactive<Record<string, string[]>>({})
const yesNo = reactive<Record<string, string | undefined>>({})

// Loaded once: a save updates `profile` without overwriting what is being typed.
if (profile.value) {
  const value = profile.value
  Object.assign(state, {
    name: value.name,
    phone: value.phone ?? '',
    address: value.address ?? '',
    city: value.city ?? '',
    postalCode: value.postalCode ?? '',
    province: value.province ?? '',
    region: value.region ?? undefined,
    // Once confirmed, the composition is the cards; the first time the family says it.
    composition: value.formStatus === 'submitted' ? { ...value.cards } : {},
  })
  for (const question of FAMILY_FORM_QUESTIONS) {
    const answer = value.formAnswers[question.id]
    if (question.type === 'multiselect') choices[question.id] = Array.isArray(answer) ? [...answer] : []
    else if (question.type === 'boolean')
      yesNo[question.id] = answer === true ? 'yes' : answer === false ? 'no' : undefined
    else texts[question.id] = typeof answer === 'string' ? answer : ''
  }
}

function answers(): FormAnswers {
  const result: FormAnswers = {}
  for (const question of FAMILY_FORM_QUESTIONS) {
    if (question.type === 'multiselect') result[question.id] = [...(choices[question.id] ?? [])]
    else if (question.type === 'boolean') {
      result[question.id] = yesNo[question.id] === 'yes' ? true : yesNo[question.id] === 'no' ? false : null
    } else result[question.id] = texts[question.id] ?? ''
  }
  return result
}

const compositionFields: { key: keyof FamilyComposition; label: string; help?: string }[] = [
  { key: 'adults', label: 'Adulti', help: 'Contando anche te.' },
  {
    key: 'youngWithCondition',
    label: 'Ragazzi e ragazze con patologie gravi o croniche, disturbi del neurosviluppo o disabilità',
  },
  { key: 'youngWithoutCondition', label: 'Ragazzi e ragazze senza patologie o disabilità' },
]

/** Declaring a young person with a condition is health data: the consent comes with it, the first time. */
const needsConsent = computed(
  () => (state.composition.youngWithCondition ?? 0) > 0 && !profile.value?.healthDataConsentAt,
)

function validate(): FormError[] {
  const errors: FormError[] = missingRequiredQuestions(answers()).map(question => ({
    name: question.id,
    message: 'Rispondi a questa domanda',
  }))
  if (needsConsent.value && !state.healthConsent) {
    errors.push({ name: 'healthConsent', message: 'Senza il consenso non puoi indicare questi ragazzi e ragazze' })
  }
  return errors
}

/** Brings the first field with an error into view and puts the focus on its first control. */
function onError(event: FormErrorEvent) {
  const name = event.errors[0]?.name
  const field = name ? document.querySelector<HTMLElement>(`[data-field="${name}"]`) : null
  if (!field) return
  field.scrollIntoView({ block: 'center' })
  field.querySelector<HTMLElement>('input, textarea, button')?.focus({ preventScroll: true })
}

const saving = ref(false)

async function save() {
  const firstTime = !submitted.value
  saving.value = true
  try {
    const result = await api<FamilyDataResult>('/api/family/profile', {
      method: 'PUT',
      body: { ...state, answers: answers() },
    })
    profile.value = result.profile
    state.healthConsent = false
    const title = firstTime ? 'Dati confermati' : 'Dati salvati'
    if (result.cardsCreated) {
      notifySuccess(
        title,
        `Abbiamo creato ${plural(result.cardsCreated, 'scheda', 'schede')}: completale con i dati di ogni persona.`,
      )
      await navigateTo('/famiglia/membri')
    } else notifySuccess(title, firstTime ? undefined : 'L’amministrazione vede già i dati nuovi.')
  } catch (error) {
    notifyError(error, 'Dati non salvati')
  } finally {
    saving.value = false
  }
}

const booleanItems = [
  { label: 'Sì', value: 'yes' },
  { label: 'No', value: 'no' },
]
</script>

<template>
  <IcPage title="Dati della famiglia" width="narrow">
    <UAlert
      v-if="profile && !submitted"
      class="mb-8"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Il primo passo per partecipare al camp"
      description="Quando confermi questi dati, creiamo una scheda per ogni persona della tua famiglia: poi la completi con il nome e la data di nascita."
    />
    <UAlert
      v-else-if="profile?.formSubmittedAt"
      class="mb-8"
      color="success"
      variant="subtle"
      icon="i-lucide-file-check"
      :title="`Confermati il ${formatDateTime(profile.formSubmittedAt)}`"
      description="Puoi cambiarli quando vuoi: quando salvi, l’amministrazione vede quelli nuovi."
    />

    <UForm :schema="familyDataFieldsSchema" :state="state" :validate="validate" @submit="save" @error="onError">
      <IcSection title="La famiglia">
        <div class="space-y-5">
          <UFormField
            label="Nome della famiglia"
            name="name"
            data-field="name"
            required
            help="Come appare negli elenchi, per esempio «Famiglia Rossi»."
          >
            <UInput v-model="state.name" class="w-full" />
          </UFormField>
          <UFormField label="Telefono" name="phone" data-field="phone" hint="Facoltativo">
            <UInput v-model="state.phone" type="tel" autocomplete="tel" class="w-full" />
          </UFormField>
        </div>
      </IcSection>

      <IcSection title="Residenza">
        <div class="space-y-5">
          <UFormField label="Via e numero civico" name="address" data-field="address" required>
            <UInput v-model="state.address" autocomplete="street-address" class="w-full" />
          </UFormField>
          <div class="grid gap-5 sm:grid-cols-[1fr_10rem]">
            <UFormField label="Città" name="city" data-field="city" required>
              <UInput v-model="state.city" autocomplete="address-level2" class="w-full" />
            </UFormField>
            <UFormField label="CAP" name="postalCode" data-field="postalCode" required>
              <UInput
                v-model="state.postalCode"
                inputmode="numeric"
                maxlength="5"
                autocomplete="postal-code"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="grid gap-5 sm:grid-cols-[1fr_10rem]">
            <UFormField label="Regione" name="region" data-field="region" required>
              <USelect
                v-model="state.region"
                :items="[...ITALIAN_REGIONS]"
                placeholder="Scegli"
                autocomplete="address-level1"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Provincia"
              name="province"
              data-field="province"
              hint="Facoltativo"
              help="La sigla, per esempio TA."
            >
              <UInput v-model="state.province" maxlength="2" autocomplete="off" class="w-full uppercase" />
            </UFormField>
          </div>
        </div>
      </IcSection>

      <IcSection
        title="Il nucleo familiare"
        :description="
          submitted
            ? 'Per aggiungere una persona alza il suo numero: creiamo la sua scheda. Per toglierla, rimuovi la sua scheda nella pagina Componenti.'
            : 'Quante persone ne fanno parte. Creiamo una scheda per ognuna.'
        "
      >
        <div class="space-y-5">
          <UFormField
            v-for="field in compositionFields"
            :key="field.key"
            :label="field.label"
            :help="field.help"
            :name="`composition.${field.key}`"
            :data-field="`composition.${field.key}`"
            required
          >
            <UInputNumber
              v-model="state.composition[field.key]"
              :min="cards[field.key]"
              :max="MAX_MEMBERS_OF_A_KIND"
              class="w-40"
            />
          </UFormField>

          <div v-if="needsConsent" class="space-y-3 rounded-lg border border-default p-4">
            <p class="flex max-w-prose items-start gap-2 text-sm">
              <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              Indicare ragazzi e ragazze con patologie o disabilità è un dato sulla salute: lo vedono solo la tua
              famiglia e l’amministrazione del camp, e non finisce mai nelle email. Puoi ritirare il consenso quando
              vuoi dalla pagina Componenti.
            </p>
            <UFormField name="healthConsent" data-field="healthConsent">
              <UCheckbox
                v-model="state.healthConsent"
                label="Acconsento al trattamento dei dati sulla salute dei componenti della mia famiglia"
              >
                <template #description>
                  Come descritto
                  <ULink to="/privacy" target="_blank" class="font-semibold text-primary underline"
                    >nell’informativa privacy</ULink
                  >.
                </template>
              </UCheckbox>
            </UFormField>
          </div>
        </div>
      </IcSection>

      <IcSection
        v-for="section in FAMILY_FORM_SECTIONS"
        :key="section.id"
        :title="section.title"
        :description="section.description"
      >
        <div class="space-y-6">
          <UFormField
            v-for="question in section.questions"
            :key="question.id"
            :name="question.id"
            :data-field="question.id"
            :label="question.label"
            :help="question.help"
            :required="question.required"
            :hint="question.required ? undefined : 'Facoltativo'"
          >
            <UInput v-if="question.type === 'text'" v-model="texts[question.id]" class="w-full" />
            <UTextarea
              v-else-if="question.type === 'textarea'"
              v-model="texts[question.id]"
              autoresize
              :rows="3"
              class="w-full"
            />
            <!-- A group is named by its legend: the label above does not reach the options. -->
            <URadioGroup
              v-else-if="question.type === 'select'"
              v-model="texts[question.id]"
              :items="question.options"
              :legend="question.label"
              :ui="{ legend: 'sr-only' }"
            />
            <UCheckboxGroup
              v-else-if="question.type === 'multiselect'"
              v-model="choices[question.id]"
              :items="question.options"
              :legend="question.label"
              :ui="{ legend: 'sr-only' }"
            />
            <URadioGroup
              v-else
              v-model="yesNo[question.id]"
              :items="booleanItems"
              orientation="horizontal"
              :legend="question.label"
              :ui="{ legend: 'sr-only' }"
            />
          </UFormField>
        </div>
      </IcSection>

      <div class="flex justify-end pt-6">
        <UButton
          type="submit"
          :label="submitted ? 'Salva le modifiche' : 'Conferma i dati'"
          :loading="saving"
          class="pointer-coarse:min-h-11"
        />
      </div>
    </UForm>
  </IcPage>
</template>
