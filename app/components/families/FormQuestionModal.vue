<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { LOCKED_QUESTIONS, type FormQuestion } from '#shared/content/family-form'
import { formQuestionSchema, hasOptions, MAX_QUESTION_OPTIONS, newFormId } from '#shared/schemas/questionnaires'
import type { FormQuestionType } from '#shared/utils/constants'

// Adds a question (`question` null) or edits one of the questionnaire «Dati della famiglia». Every option
// carries its `origin`, the text it has in the saved form (null when new): the editor turns the
// differences into renames, which the server applies to the answers already given. `saved` is the
// question as it is in the saved form, if it is there: its type stays (text and long text excepted).
// The questions the code reads (LOCKED_QUESTIONS) change only in text and help.
export interface EditedQuestion {
  question: FormQuestion
  origins: (string | null)[]
}

const props = defineProps<{
  question: FormQuestion | null
  origins: (string | null)[]
  saved: FormQuestion | null
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ submit: [value: EditedQuestion] }>()

interface OptionRow {
  key: number
  label: string
  origin: string | null
}

const formId = useId()
const state = reactive({
  id: '',
  label: '',
  help: '',
  type: 'select' as FormQuestionType,
  required: false,
  options: [] as OptionRow[],
})
let nextKey = 0
const row = (label: string, origin: string | null): OptionRow => ({ key: nextKey++, label, origin })

watch(open, value => {
  if (!value) return
  const question = props.question
  Object.assign(state, {
    id: question?.id ?? newFormId('q'),
    label: question?.label ?? '',
    help: question?.help ?? '',
    type: question?.type ?? 'select',
    required: question?.required ?? false,
    options: question?.options?.map((label, i) => row(label, props.origins[i] ?? null)) ?? [
      row('', null),
      row('', null),
    ],
  })
})

const enums = useEnums()
const lockedReason = computed(() => LOCKED_QUESTIONS[state.id])
const TEXT_TYPES: FormQuestionType[] = ['text', 'textarea']
/** The types this question can take: all for a new one, the same kind of answer for one already saved. */
const typeItems = computed(() => {
  const saved = props.saved
  const only = !saved ? undefined : TEXT_TYPES.includes(saved.type) ? TEXT_TYPES : [saved.type]
  return enums.options('formQuestionType', only)
})
const typeHelp = computed(() => {
  if (lockedReason.value) return undefined
  if (props.saved && !TEXT_TYPES.includes(props.saved.type)) {
    return 'Il tipo non si cambia: le famiglie potrebbero aver già risposto. Per un tipo diverso, togli la domanda e creane una nuova.'
  }
  return enums.meta('formQuestionType', state.type).description
})
const withOptions = computed(() => hasOptions(state.type))
const newlyRequired = computed(() => !!props.saved && !props.saved.required && state.required)

function moveOption(index: number, by: number) {
  const [option] = state.options.splice(index, 1)
  state.options.splice(index + by, 0, option!)
}

function draft() {
  return {
    id: state.id,
    label: state.label,
    help: state.help,
    type: state.type,
    required: state.required,
    options: withOptions.value ? state.options.map(option => option.label) : undefined,
  }
}

function validate(): FormError[] {
  const result = formQuestionSchema.safeParse(draft())
  if (result.success) return []
  return result.error.issues.map(issue => ({ name: String(issue.path[0] ?? 'label'), message: issue.message }))
}

function onSubmit() {
  const question = formQuestionSchema.parse(draft())
  const origins = withOptions.value ? state.options.map(option => option.origin) : []
  emit('submit', { question, origins })
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="question ? 'Modifica la domanda' : 'Nuova domanda'"
    :ui="{ wrapper: 'pe-12', close: 'pointer-coarse:size-11 pointer-coarse:justify-center' }"
  >
    <template #body>
      <UForm :id="formId" :state="state" :validate="validate" class="space-y-5" @submit="onSubmit">
        <UAlert
          v-if="lockedReason"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          title="Il gestionale usa questa domanda"
          :description="`${lockedReason} Puoi cambiare il testo e l’aiuto; tipo, opzioni e obbligatorietà restano questi.`"
        />
        <UFormField
          label="Domanda"
          name="label"
          required
          :help="
            saved
              ? 'Le risposte già date restano. Se cambi il senso della domanda, meglio toglierla e crearne una nuova.'
              : undefined
          "
        >
          <UTextarea v-model="state.label" :rows="2" :maxlength="300" autoresize class="w-full" />
        </UFormField>
        <UFormField
          label="Aiuto"
          name="help"
          hint="Facoltativo"
          help="Una frase sotto la domanda, per spiegare cosa serve o perché lo chiediamo."
        >
          <UTextarea v-model="state.help" :rows="2" :maxlength="500" autoresize class="w-full" />
        </UFormField>
        <UFormField label="Tipo di risposta" name="type" :help="typeHelp">
          <USelect
            v-model="state.type"
            :items="typeItems"
            :disabled="!!lockedReason || typeItems.length < 2"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="withOptions"
          label="Opzioni"
          name="options"
          :help="
            lockedReason
              ? undefined
              : 'Se rinomini un’opzione, cambiano anche le risposte di chi l’aveva scelta. Se la togli, chi l’aveva scelta risponde di nuovo.'
          "
        >
          <ol class="space-y-2">
            <li v-for="(option, index) in state.options" :key="option.key" class="flex items-center gap-1">
              <UInput
                v-model="option.label"
                :maxlength="120"
                :disabled="!!lockedReason"
                :aria-label="`Opzione ${index + 1}`"
                class="min-w-0 flex-1"
              />
              <template v-if="!lockedReason">
                <UButton
                  icon="i-lucide-arrow-up"
                  color="neutral"
                  variant="ghost"
                  :disabled="index === 0"
                  :aria-label="`Sposta su l’opzione ${index + 1}`"
                  class="pointer-coarse:size-11 pointer-coarse:justify-center"
                  @click="moveOption(index, -1)"
                />
                <UButton
                  icon="i-lucide-arrow-down"
                  color="neutral"
                  variant="ghost"
                  :disabled="index === state.options.length - 1"
                  :aria-label="`Sposta giù l’opzione ${index + 1}`"
                  class="pointer-coarse:size-11 pointer-coarse:justify-center"
                  @click="moveOption(index, 1)"
                />
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  :aria-label="`Togli l’opzione ${index + 1}`"
                  class="pointer-coarse:size-11 pointer-coarse:justify-center"
                  @click="state.options.splice(index, 1)"
                />
              </template>
            </li>
          </ol>
          <UButton
            v-if="!lockedReason && state.options.length < MAX_QUESTION_OPTIONS"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            label="Aggiungi un’opzione"
            class="mt-3 pointer-coarse:min-h-11"
            @click="state.options.push(row('', null))"
          />
        </UFormField>

        <UFormField name="required">
          <UCheckbox
            v-model="state.required"
            :disabled="!!lockedReason"
            label="Risposta obbligatoria"
            :description="
              newlyRequired
                ? 'Le famiglie che hanno già confermato i dati vedranno un avviso e dovranno rispondere la prossima volta che salvano.'
                : 'Senza risposta la famiglia non può confermare i suoi dati.'
            "
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          label="Annulla"
          class="pointer-coarse:min-h-11"
          @click="open = false"
        />
        <UButton
          type="submit"
          :form="formId"
          :label="question ? 'Applica' : 'Aggiungi la domanda'"
          class="pointer-coarse:min-h-11"
        />
      </div>
    </template>
  </UModal>
</template>
