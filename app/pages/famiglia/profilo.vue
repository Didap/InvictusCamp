<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { formQuestions } from '#shared/content/family-form'
import {
  COMPOSITION_GROUPS,
  familyDataFieldsSchema,
  GUEST_MISSING_MESSAGE,
  guestsMin,
  MAX_MEMBERS_OF_A_KIND,
  missingRequiredQuestions,
  questionsToAnswer,
  type FamilyComposition,
} from '#shared/schemas/families'
import type { FamilyDataResult, FamilyFormView, FamilyProfileDto } from '#shared/types/families'
import type { ItalianRegion } from '#shared/utils/constants'
import { formatDateTime, plural, surnameOf } from '#shared/utils/format'
import { answerFields, fieldAnswers, type AnswerFields } from '~/utils/family-form'
import { focusFirstError } from '~/utils/errors'

// The family data (docs/spec.md, 3.8): the first form of the family, editable afterwards. Confirming it
// creates one card per person declared, filled in on /famiglia/membri; the «-» removes an empty card. The
// composition never goes below the cards filled in (the inputs stop at them): that person leaves by
// removing their card.
const api = useApi()
const [{ data: profile }, { data: form, error: formError, refresh: refreshForm }] = await Promise.all([
  useApiFetch<FamilyProfileDto>('/api/family/profile'),
  // The questions as the administration set them (/admin/famiglie/modulo), with their revision.
  useApiFetch<FamilyFormView>('/api/family/form'),
])
const sections = computed(() => form.value?.sections ?? [])
const questions = computed(() => formQuestions(sections.value))

const submitted = computed(() => profile.value?.formStatus === 'submitted')
const filledCards = computed<FamilyComposition>(
  () => profile.value?.filledCards ?? { adults: 1, youngWithCondition: 0, youngWithoutCondition: 0 },
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
  /** The names of the young people with a condition added now, asked next to their number. */
  guestNames: [] as string[],
  healthConsent: false,
})

/** The inputs stop at the cards filled in, the young people with a condition also at `guestsMin`. */
const guestsAtLeast = computed(() => guestsMin(profile.value?.formStatus ?? 'draft'))
const minOf = (key: keyof FamilyComposition) =>
  Math.max(filledCards.value[key], key === 'youngWithCondition' ? guestsAtLeast.value : 0)

/** The young people with a condition this save adds: the form asks their names now, their cards are born with them. */
const newGuests = computed(() =>
  Math.max(0, (state.composition.youngWithCondition ?? 0) - (profile.value?.cards.youngWithCondition ?? 0)),
)
const guestLabel = (i: number) =>
  newGuests.value > 1 ? `Nome del ragazzo o della ragazza ${i + 1}` : 'Nome del ragazzo o della ragazza'

// The answers to the questions (app/utils/family-form.ts).
const fields = reactive<AnswerFields>(answerFields(questions.value, profile.value?.formAnswers))
/** Required questions to answer because the form changed after the family confirmed its data. */
const toAnswer = computed(() =>
  submitted.value ? questionsToAnswer(profile.value?.formAnswers ?? {}, questions.value) : 0,
)

// Loaded once: a save updates `profile` without overwriting what is being typed.
if (profile.value) {
  const value = profile.value
  Object.assign(state, {
    name: surnameOf(value.name),
    phone: value.phone ?? '',
    address: value.address ?? '',
    city: value.city ?? '',
    postalCode: value.postalCode ?? '',
    province: value.province ?? '',
    region: value.region ?? undefined,
    // Once confirmed, the composition is the cards; the first time the family says it.
    composition: value.formStatus === 'submitted' ? { ...value.cards } : {},
  })
}

const answers = () => fieldAnswers(questions.value, fields)

/** The administration changed the form meanwhile: the new questions, keeping what was typed where it fits. */
async function reloadQuestions() {
  const typed = answers()
  await refreshForm()
  Object.assign(fields, answerFields(questions.value, typed))
}

/** Under a number that cannot go lower: a person whose card is filled in leaves from the Componenti page. */
function fieldHelp(field: (typeof COMPOSITION_GROUPS)[number]): string | undefined {
  const help = 'help' in field ? field.help : undefined
  const filled = filledCards.value[field.key]
  if (!submitted.value || !filled) return help
  const note = `${plural(filled, 'scheda compilata', 'schede compilate')}: per toglierle usa la pagina Componenti.`
  return help ? `${help} ${note}` : note
}

/** Declaring a young person with a condition is health data: the consent comes with it, the first time. */
const needsConsent = computed(
  () => (state.composition.youngWithCondition ?? 0) > 0 && !profile.value?.healthDataConsentAt,
)

function validate(): FormError[] {
  const errors: FormError[] = missingRequiredQuestions(answers(), questions.value).map(question => ({
    name: question.id,
    message: 'Rispondi a questa domanda',
  }))
  if ((state.composition.youngWithCondition ?? 0) < guestsAtLeast.value) {
    errors.push({ name: 'composition.youngWithCondition', message: GUEST_MISSING_MESSAGE })
  }
  for (let i = 0; i < newGuests.value; i++) {
    if (!state.guestNames[i]?.trim()) errors.push({ name: `guestNames.${i}`, message: 'Scrivi il nome' })
  }
  if (needsConsent.value && !state.healthConsent) {
    errors.push({ name: 'healthConsent', message: 'Senza il consenso non puoi indicare questi ragazzi e ragazze' })
  }
  return errors
}

const saving = ref(false)

async function save() {
  const firstTime = !submitted.value
  saving.value = true
  try {
    const result = await api<FamilyDataResult>('/api/family/profile', {
      method: 'PUT',
      body: {
        ...state,
        guestNames: state.guestNames.slice(0, newGuests.value),
        answers: answers(),
        formRevision: form.value?.revision,
      },
    })
    profile.value = result.profile
    state.guestNames = []
    state.healthConsent = false
    const title = firstTime ? 'Dati confermati' : 'Dati salvati'
    const removed = result.cardsRemoved
      ? `Abbiamo tolto ${plural(result.cardsRemoved, 'scheda vuota', 'schede vuote')}.`
      : ''
    if (result.cardsCreated) {
      notifySuccess(
        title,
        `Abbiamo creato ${plural(result.cardsCreated, 'scheda', 'schede')}: completale con i dati di ogni persona. ${removed}`.trim(),
      )
      await navigateTo('/famiglia/membri')
    } else notifySuccess(title, removed || (firstTime ? undefined : 'L’amministrazione vede già i dati nuovi.'))
  } catch (error) {
    notifyError(error, 'Dati non salvati')
    if (apiErrorData(error)?.reason === 'form_changed') await reloadQuestions()
  } finally {
    saving.value = false
  }
}
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
      v-else-if="toAnswer"
      class="mb-8"
      color="warning"
      variant="subtle"
      icon="i-lucide-message-circle-question"
      :title="toAnswer === 1 ? 'C’è una domanda a cui rispondere' : `Ci sono ${toAnswer} domande a cui rispondere`"
      description="Abbiamo cambiato qualche domanda dopo che hai confermato i tuoi dati: le trovi qui sotto, segnate in rosso quando salvi. Rispondi e salva."
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

    <UAlert
      v-if="formError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Le domande non si sono caricate"
      :description="`${apiErrorMessage(formError)}. Ricarica la pagina.`"
    />
    <UForm
      v-else
      :schema="familyDataFieldsSchema"
      :state="state"
      :validate="validate"
      @submit="save"
      @error="focusFirstError"
    >
      <IcSection title="La famiglia">
        <div class="space-y-5">
          <UFormField
            label="Cognome della famiglia"
            name="name"
            data-field="name"
            required
            help="Per esempio «Rossi»: negli elenchi del camp appare come «Famiglia Rossi»."
          >
            <UInput v-model="state.name" class="w-full" />
          </UFormField>
          <UFormField label="Telefono" name="phone" data-field="phone" required>
            <UInput v-model="state.phone" type="tel" autocomplete="tel" class="w-full" />
          </UFormField>
        </div>
      </IcSection>

      <IcSection title="Residenza">
        <IcResidenceFields v-model="state" required />
      </IcSection>

      <IcSection
        title="Il nucleo familiare"
        description="Per aggiungere una persona premi sul tasto «+». Per ogni persona del nucleo familiare è prevista una scheda personale. Per rimuovere una persona dal nucleo familiare premi sul tasto «-»."
      >
        <div class="space-y-5">
          <template v-for="field in COMPOSITION_GROUPS" :key="field.key">
            <UFormField
              :label="field.label"
              :help="fieldHelp(field)"
              :name="`composition.${field.key}`"
              :data-field="`composition.${field.key}`"
              required
            >
              <UInputNumber
                v-model="state.composition[field.key]"
                :min="minOf(field.key)"
                :max="MAX_MEMBERS_OF_A_KIND"
                class="w-40"
              />
            </UFormField>
            <div
              v-if="field.key === 'youngWithCondition' && newGuests"
              class="grid gap-4 border-s-2 border-default ps-4 sm:grid-cols-2"
            >
              <UFormField
                v-for="(_, i) in newGuests"
                :key="i"
                :label="guestLabel(i)"
                :name="`guestNames.${i}`"
                :data-field="`guestNames.${i}`"
                required
              >
                <UInput v-model="state.guestNames[i]" autocomplete="off" class="w-full" />
              </UFormField>
            </div>
          </template>

          <div v-if="needsConsent" class="space-y-3 rounded-lg border border-default p-4">
            <p class="flex max-w-prose items-start gap-2 text-sm">
              <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              Indicare ragazzi e ragazze con patologie o disabilità è un dato sulla salute: lo vedono solo la tua
              famiglia e l’amministrazione del camp, e non finisce mai nelle email. Puoi ritirare il consenso quando
              vuoi dalla pagina Componenti.
            </p>
            <UFormField name="healthConsent" data-field="healthConsent">
              <FamiliesHealthConsentCheckbox v-model="state.healthConsent" />
            </UFormField>
          </div>
        </div>
      </IcSection>

      <FamiliesFormQuestions :sections="sections" :fields="fields" />

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
