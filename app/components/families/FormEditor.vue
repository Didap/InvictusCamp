<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { formQuestions, lockedReason, type FormQuestion, type FormSection } from '#shared/content/family-form'
import {
  familyFormSaveSchema,
  hasOptions,
  MAX_FORM_SECTIONS,
  type FamilyFormSaveInput,
  type OptionRename,
} from '#shared/schemas/questionnaires'
import type { FamilyFormDto, FamilyFormSaveResult } from '#shared/types/families'
import { enumLabel } from '#shared/utils/constants'
import { plural } from '#shared/utils/format'
import { copyOf, moveAt, newId, sameContent } from '#shared/utils/plain'
import { answerFields, type AnswerFields } from '~/utils/family-form'
import type { EditedQuestion } from './FormQuestionModal.vue'

// The editor of the questionnaire «Dati della famiglia» (docs/spec.md 3.8). Changes stay on this page
// until Salva, which sends the whole form with the revision it was loaded at: if someone saved in
// between, the server refuses (409). The options keep the text they have in the saved form (`origins`),
// so a rename travels with the save and the server rewrites the answers that chose it. Leaving with
// unsaved changes asks first. `saved` hands the new form to the page.
const props = defineProps<{ form: FamilyFormDto }>()
const emit = defineEmits<{ saved: [form: FamilyFormDto] }>()

const api = useApi()
const confirm = useConfirm()
const toast = useToast()

/** The questions as they are saved, by id: their type stays, their options are where renames start. */
const saved = computed(
  () => new Map(formQuestions(props.form.content.sections).map(question => [question.id, question])),
)

const draft = ref<FormSection[]>([])
/** The origins of the options of the questions edited since the last save; the others are as saved. */
const origins = ref<Record<string, (string | null)[]>>({})
const originsOf = (id: string) => origins.value[id] ?? saved.value.get(id)?.options ?? []
function reset() {
  draft.value = copyOf(props.form.content.sections)
  origins.value = {}
}
reset()
watch(() => props.form, reset)

/** The draft as the server stores it: an empty description is no description. */
const cleaned = (sections: FormSection[]) =>
  sections.map(({ description, ...section }) => (description?.trim() ? { ...section, description } : section))
const dirty = computed(() => !sameContent(cleaned(draft.value), props.form.content.sections))

function renames(): OptionRename[] {
  return formQuestions(draft.value).flatMap(question =>
    (question.options ?? []).flatMap((option, i) => {
      const from = originsOf(question.id)[i]
      return from && from !== option ? [{ questionId: question.id, from, to: option }] : []
    }),
  )
}

// ─── Save ──────────────────────────────────────────────────────────────────────────────────────────

/** What the families will notice, said before saving: questions taken out, new required questions. */
function consequences(): string[] {
  const next = formQuestions(draft.value)
  const ids = new Set(next.map(question => question.id))
  const removed = [...saved.value.values()].filter(question => !ids.has(question.id)).length
  const required = next.filter(question => question.required && !saved.value.get(question.id)?.required).length
  const lines: string[] = []
  if (removed) {
    lines.push(
      `${plural(removed, 'domanda esce', 'domande escono')} dal modulo: le risposte già date restano nella scheda di ogni famiglia, sotto «Domande non più nel modulo».`,
    )
  }
  if (required) {
    lines.push(
      `${plural(required, 'domanda obbligatoria nuova', 'domande obbligatorie nuove')}: le famiglie che hanno già confermato i dati vedono un avviso e rispondono la prossima volta che salvano.`,
    )
  }
  return lines
}

const saving = ref(false)
async function onSave() {
  const body: FamilyFormSaveInput = {
    revision: props.form.revision,
    sections: cleaned(draft.value),
    renames: renames(),
  }
  const check = familyFormSaveSchema.safeParse(body)
  if (!check.success) {
    const issue = check.error.issues[0]!
    const section = issue.path[0] === 'sections' && typeof issue.path[1] === 'number' ? issue.path[1] + 1 : null
    toast.add({
      title: 'Modulo non salvato',
      description: section ? `Sezione ${section}: ${issue.message}` : issue.message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
    return
  }
  const lines = consequences()
  if (
    lines.length &&
    !(await confirm({
      title: 'Salvare il modulo?',
      description: `Le famiglie vedono subito il modulo nuovo. ${lines.join(' ')}`,
      confirmLabel: 'Salva il modulo',
      cancelLabel: 'Continua a modificare',
    }))
  ) {
    return
  }
  saving.value = true
  try {
    const result = await api<FamilyFormSaveResult>('/api/admin/family-form', { method: 'PUT', body })
    emit('saved', result.form)
    notifySuccess(
      'Modulo salvato',
      result.answersUpdated
        ? `Le famiglie lo vedono già. Aggiornate le risposte di ${plural(result.answersUpdated, 'famiglia', 'famiglie')} con le opzioni rinominate.`
        : 'Le famiglie lo vedono già.',
    )
  } catch (error) {
    notifyError(error, 'Modulo non salvato')
  } finally {
    saving.value = false
  }
}

useLeaveGuard(dirty, 'al modulo')

// ─── Sections ──────────────────────────────────────────────────────────────────────────────────────

function addSection() {
  draft.value.push({ id: newId('s'), title: '', questions: [] })
}

function moveSection(index: number, by: number) {
  moveAt(draft.value, index, by)
}

const hasLocked = (section: FormSection) => section.questions.some(question => lockedReason(question.id))

async function removeSection(index: number) {
  const section = draft.value[index]!
  const count = section.questions.length
  if (
    count &&
    !(await confirm({
      title: `Togliere la sezione${section.title ? ` «${section.title}»` : ''}?`,
      description: `Escono dal modulo anche le sue ${plural(count, 'domanda', 'domande')}: le risposte già date restano nella scheda di ogni famiglia. La modifica vale quando salvi.`,
      confirmLabel: 'Togli la sezione',
      danger: true,
    }))
  ) {
    return
  }
  draft.value.splice(index, 1)
}

function sectionItems(index: number): DropdownMenuItem[][] {
  const section = draft.value[index]!
  return [
    [
      { label: 'Sposta su', icon: 'i-lucide-arrow-up', disabled: index === 0, onSelect: () => moveSection(index, -1) },
      {
        label: 'Sposta giù',
        icon: 'i-lucide-arrow-down',
        disabled: index === draft.value.length - 1,
        onSelect: () => moveSection(index, 1),
      },
    ],
    [
      {
        label: hasLocked(section) ? 'Togli la sezione (ha domande che il gestionale usa)' : 'Togli la sezione',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: hasLocked(section),
        onSelect: () => removeSection(index),
      },
    ],
  ]
}

// ─── Questions ─────────────────────────────────────────────────────────────────────────────────────

const modalOpen = ref(false)
const editing = ref<{ sectionId: string; question: FormQuestion | null }>({ sectionId: '', question: null })
function openQuestion(sectionId: string, question: FormQuestion | null) {
  editing.value = { sectionId, question }
  modalOpen.value = true
}

function applyQuestion({ question, origins: kept }: EditedQuestion) {
  origins.value[question.id] = kept
  const section = draft.value.find(item => item.id === editing.value.sectionId)
  if (!section) return
  const index = section.questions.findIndex(item => item.id === question.id)
  if (index === -1) section.questions.push(question)
  else section.questions[index] = question
}

/** Up from the first place goes to the end of the section above; down from the last, to the top of the next. */
function moveQuestion(sectionIndex: number, index: number, by: -1 | 1) {
  const section = draft.value[sectionIndex]!
  const [question] = section.questions.splice(index, 1)
  const target = index + by
  if (target >= 0 && target <= section.questions.length) section.questions.splice(target, 0, question!)
  else if (by < 0) draft.value[sectionIndex - 1]!.questions.push(question!)
  else draft.value[sectionIndex + 1]!.questions.unshift(question!)
}

/** The toast puts the question back where it was, if its section is still there. */
function removeQuestion(section: FormSection, index: number) {
  const [question] = section.questions.splice(index, 1)
  const sectionId = section.id
  toast.add({
    title: `«${question!.label}» tolta dal modulo`,
    description: 'La modifica vale quando salvi.',
    color: 'neutral',
    actions: [
      {
        label: 'Rimetti',
        color: 'neutral',
        variant: 'outline',
        onClick: () => {
          const target = draft.value.find(item => item.id === sectionId)
          if (!target || formQuestions(draft.value).some(item => item.id === question!.id)) return
          target.questions.splice(Math.min(index, target.questions.length), 0, question!)
        },
      },
    ],
  })
}

function questionItems(sectionIndex: number, index: number): DropdownMenuItem[][] {
  const section = draft.value[sectionIndex]!
  const question = section.questions[index]!
  const locked = !!lockedReason(question.id)
  return [
    [{ label: 'Modifica', icon: 'i-lucide-pencil', onSelect: () => openQuestion(section.id, question) }],
    [
      {
        label: 'Sposta su',
        icon: 'i-lucide-arrow-up',
        disabled: sectionIndex === 0 && index === 0,
        onSelect: () => moveQuestion(sectionIndex, index, -1),
      },
      {
        label: 'Sposta giù',
        icon: 'i-lucide-arrow-down',
        disabled: sectionIndex === draft.value.length - 1 && index === section.questions.length - 1,
        onSelect: () => moveQuestion(sectionIndex, index, 1),
      },
    ],
    [
      {
        label: locked ? 'Togli (il gestionale la usa)' : 'Togli dal modulo',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: locked,
        onSelect: () => removeQuestion(section, index),
      },
    ],
  ]
}

function summary(question: FormQuestion): string {
  const parts = [enumLabel('formQuestionType', question.type), question.required ? 'obbligatoria' : 'facoltativa']
  if (hasOptions(question.type)) parts.push(question.options!.join(', '))
  return parts.join(' · ')
}

// ─── Preview ───────────────────────────────────────────────────────────────────────────────────────

const TABS = [
  { label: 'Modifica', value: 'edit', icon: 'i-lucide-pencil' },
  { label: 'Anteprima', value: 'preview', icon: 'i-lucide-eye' },
]
const tab = ref('edit')
const previewFields = ref<AnswerFields>(answerFields([]))
watch(tab, value => {
  if (value === 'preview') previewFields.value = answerFields(formQuestions(draft.value))
})
</script>

<template>
  <div>
    <IcSaveBar
      :dirty="dirty"
      :saving="saving"
      :updated-at="form.updatedAt"
      :updated-by-name="form.updatedByName"
      never-saved="Il modulo di partenza, mai modificato"
      discard-description="Il modulo torna com’era all’ultimo salvataggio."
      @save="onSave"
      @discard="reset"
    />

    <UAlert
      class="mb-6"
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-alert"
      title="Niente dati sulla salute in questo modulo"
      description="Patologie, terapie, allergie e diete si chiedono nelle schede dei componenti, che chiedono il consenso della famiglia e registrano chi le legge. Qui solo domande sulla famiglia e sul soggiorno."
    />

    <UTabs v-model="tab" :items="TABS" :content="false" variant="link" class="mb-6" />

    <div v-if="tab === 'edit'" class="space-y-6">
      <p class="max-w-prose text-sm text-muted">
        La famiglia vede queste sezioni dopo la residenza e il nucleo familiare, che restano fissi.
      </p>
      <section
        v-for="(section, sectionIndex) in draft"
        :key="section.id"
        class="rounded-lg border border-default p-4 sm:p-5"
        :aria-label="section.title || `Sezione ${sectionIndex + 1}`"
      >
        <div class="flex items-start gap-2">
          <div class="min-w-0 flex-1 space-y-3">
            <UFormField label="Titolo della sezione" :name="`section-${section.id}`" required>
              <UInput v-model="section.title" :maxlength="120" class="w-full" />
            </UFormField>
            <UFormField label="Descrizione" hint="Facoltativo" :name="`section-${section.id}-description`">
              <UTextarea v-model="section.description" :rows="1" :maxlength="500" autoresize class="w-full" />
            </UFormField>
          </div>
          <UDropdownMenu :items="sectionItems(sectionIndex)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :aria-label="`Azioni per la sezione ${section.title || sectionIndex + 1}`"
              class="pointer-coarse:size-11 pointer-coarse:justify-center"
            />
          </UDropdownMenu>
        </div>

        <ol v-if="section.questions.length" class="mt-5 divide-y divide-default border-y border-default">
          <li v-for="(question, index) in section.questions" :key="question.id" class="flex items-start gap-2 py-3">
            <div class="min-w-0 flex-1">
              <button
                type="button"
                class="text-left font-medium text-highlighted underline-offset-2 hover:underline"
                @click="openQuestion(section.id, question)"
              >
                {{ question.label }}
              </button>
              <p class="mt-0.5 text-sm text-muted">{{ summary(question) }}</p>
              <p v-if="lockedReason(question.id)" class="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <UIcon name="i-lucide-lock" class="size-3.5 shrink-0" aria-hidden="true" />
                Il gestionale la usa: si cambiano solo il testo e l’aiuto.
              </p>
            </div>
            <UDropdownMenu :items="questionItems(sectionIndex, index)" :content="{ align: 'end' }">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Azioni per «${question.label}»`"
                class="pointer-coarse:size-11 pointer-coarse:justify-center"
              />
            </UDropdownMenu>
          </li>
        </ol>
        <p v-else class="mt-5 text-sm text-muted">Nessuna domanda: aggiungine una o togli la sezione.</p>

        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          label="Aggiungi una domanda"
          class="mt-4 pointer-coarse:min-h-11"
          @click="openQuestion(section.id, null)"
        />
      </section>

      <UButton
        v-if="draft.length < MAX_FORM_SECTIONS"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        label="Aggiungi una sezione"
        class="pointer-coarse:min-h-11"
        @click="addSection"
      />
    </div>

    <div v-else class="max-w-3xl">
      <UAlert
        class="mb-6"
        color="info"
        variant="subtle"
        icon="i-lucide-eye"
        title="Così la vede la famiglia"
        description="Dopo la residenza e il nucleo familiare. Puoi provare a rispondere: qui non si salva niente."
      />
      <FamiliesFormQuestions :sections="draft" :fields="previewFields" />
    </div>

    <FamiliesFormQuestionModal
      v-model:open="modalOpen"
      :question="editing.question"
      :origins="editing.question ? originsOf(editing.question.id) : []"
      :saved="editing.question ? (saved.get(editing.question.id) ?? null) : null"
      @submit="applyQuestion"
    />
  </div>
</template>
