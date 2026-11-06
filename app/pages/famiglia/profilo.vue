<script setup lang="ts">
import type { FormError, FormErrorEvent } from '@nuxt/ui'
import { FAMILY_FORM_QUESTIONS, FAMILY_FORM_SECTIONS } from '#shared/content/family-form'
import { missingRequiredQuestions } from '#shared/schemas/families'
import type { FormAnswers } from '#shared/types/domain'
import type { FamilyProfileDto } from '#shared/types/families'
import { formatDateTime } from '#shared/utils/format'

// The family's data and the questionnaire (shared/content/family-form.ts): saved as a draft or sent,
// and still editable after sending (docs/spec.md, 3.8).
const api = useApi()
const { data: profile } = await useApiFetch<FamilyProfileDto>('/api/family/profile')

// ─── Family data ───
// Its own copy, so saving the questionnaire never resets a data field being edited.
const familyData = ref(profile.value ? { ...profile.value } : null)
function onDataSaved(result: unknown) {
  familyData.value = result as FamilyProfileDto
}

// ─── Questionnaire ───
// One record per kind of field, so every input gets a value of its own type.
const texts = reactive<Record<string, string>>({})
const choices = reactive<Record<string, string[]>>({})
const yesNo = reactive<Record<string, string | undefined>>({})
const answersState = reactive({ texts, choices, yesNo })

function loadAnswers(value: FamilyProfileDto) {
  for (const question of FAMILY_FORM_QUESTIONS) {
    const answer = value.formAnswers[question.id]
    if (question.type === 'multiselect') choices[question.id] = Array.isArray(answer) ? [...answer] : []
    else if (question.type === 'boolean')
      yesNo[question.id] = answer === true ? 'yes' : answer === false ? 'no' : undefined
    else texts[question.id] = typeof answer === 'string' ? answer : ''
  }
}
// Loaded once: later saves update `profile` without overwriting what is being typed.
if (profile.value) loadAnswers(profile.value)

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

const submitted = computed(() => profile.value?.formStatus === 'submitted')
/** Required answers are checked once the family tries to send, and always after it has sent. */
const strict = ref(false)
const form = useTemplateRef('questionnaire')

function validate(): FormError[] {
  if (!strict.value && !submitted.value) return []
  return missingRequiredQuestions(answers()).map(question => ({
    name: question.id,
    message: 'Rispondi a questa domanda',
  }))
}

const sending = ref(false)
const savingDraft = ref(false)

async function save(submit: boolean) {
  const wasSubmitted = submitted.value
  profile.value = await api<FamilyProfileDto>('/api/family/profile/form', {
    method: 'PUT',
    body: { answers: answers(), submit },
  })
  if (wasSubmitted) notifySuccess('Risposte aggiornate', 'L’amministrazione vede già le nuove risposte.')
  else if (submit) notifySuccess('Questionario inviato', 'Grazie. Puoi ancora cambiare le risposte quando vuoi.')
  else notifySuccess('Bozza salvata', 'Puoi completare il questionario quando vuoi.')
}

async function send() {
  sending.value = true
  try {
    await save(true)
  } catch (error) {
    notifyError(error, 'Questionario non inviato')
  } finally {
    sending.value = false
  }
}

async function saveDraft() {
  strict.value = false
  form.value?.clear()
  savingDraft.value = true
  try {
    await save(false)
  } catch (error) {
    notifyError(error, 'Bozza non salvata')
  } finally {
    savingDraft.value = false
  }
}

function onSendClick() {
  strict.value = true
}

/** Brings the first unanswered question into view and puts the focus on its first control. */
function onError(event: FormErrorEvent) {
  const name = event.errors[0]?.name
  const field = name ? document.getElementById(`domanda-${name}`) : null
  if (!field) return
  field.scrollIntoView({ block: 'center' })
  field.querySelector<HTMLElement>('input, textarea, button')?.focus({ preventScroll: true })
}

const booleanItems = [
  { label: 'Sì', value: 'yes' },
  { label: 'No', value: 'no' },
]
</script>

<template>
  <IcPage title="Scheda famiglia" width="narrow">
    <IcSection title="Dati della famiglia" description="Come vi chiamiamo e dove vi troviamo.">
      <FamiliesFamilyDataForm
        v-if="familyData"
        :family="familyData"
        endpoint="/api/family/profile"
        method="PUT"
        submit-label="Salva i dati"
        @saved="onDataSaved"
      />
    </IcSection>

    <IcSection
      title="Questionario"
      description="Qualche domanda su di voi e sulle esigenze per il soggiorno. Le domande con l’asterisco sono obbligatorie."
    >
      <template v-if="profile" #actions>
        <IcStatusBadge kind="familyFormStatus" :value="profile.formStatus" />
      </template>

      <UAlert
        v-if="profile?.formSubmittedAt && submitted"
        class="mb-6"
        color="success"
        variant="subtle"
        icon="i-lucide-file-check"
        :title="`Inviato il ${formatDateTime(profile.formSubmittedAt)}`"
        description="Puoi ancora cambiare le risposte: quando salvi, l’amministrazione vede quelle nuove."
      />

      <UForm
        ref="questionnaire"
        :state="answersState"
        :validate="validate"
        class="space-y-10"
        @submit="send"
        @error="onError"
      >
        <fieldset v-for="section in FAMILY_FORM_SECTIONS" :key="section.id" class="space-y-6">
          <legend class="mb-1 text-base font-bold text-highlighted">{{ section.title }}</legend>
          <p v-if="section.description" class="max-w-prose text-sm text-muted">{{ section.description }}</p>
          <UFormField
            v-for="question in section.questions"
            :id="`domanda-${question.id}`"
            :key="question.id"
            :name="question.id"
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
        </fieldset>

        <div class="flex flex-wrap justify-end gap-3 border-t border-default pt-6">
          <UButton
            v-if="!submitted"
            color="neutral"
            variant="outline"
            label="Salva come bozza"
            class="pointer-coarse:min-h-11"
            :loading="savingDraft"
            @click="saveDraft"
          />
          <UButton
            type="submit"
            :label="submitted ? 'Salva le modifiche' : 'Invia il questionario'"
            :loading="sending"
            class="pointer-coarse:min-h-11"
            @click="onSendClick"
          />
        </div>
      </UForm>
    </IcSection>
  </IcPage>
</template>
