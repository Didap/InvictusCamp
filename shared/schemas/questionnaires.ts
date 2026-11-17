// The questionnaire «Dati della famiglia» as the administration edits it (/admin/famiglie/modulo): one
// question (the modal of the editor) and the whole form (PUT /api/admin/family-form). The rules that need
// the form already saved (questions the code reads, types, renamed options) are in
// server/domain/questionnaires.ts.
import { z } from 'zod'
import type { FormQuestion } from '../content/family-form'
import { FORM_QUESTION_TYPES, type FormQuestionType } from '../utils/constants'
import { zRequiredText, zText } from './common'

export const MAX_FORM_SECTIONS = 12
export const MAX_FORM_QUESTIONS = 60
export const MAX_QUESTION_OPTIONS = 30
const OPTION_MAX = 120

export function hasOptions(type: FormQuestionType): boolean {
  return type === 'select' || type === 'multiselect'
}

/** Ids of sections and questions: made by the editor, never shown; answers are stored under them. */
const zFormId = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, { error: 'Identificativo non valido' })

/** A new id for a section or a question, never one used before (answers stay under the old ones). */
export function newFormId(prefix: 'q' | 's'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

const sameOption = (a: string, b: string) => a.trim().toLocaleLowerCase('it') === b.trim().toLocaleLowerCase('it')

export const formQuestionSchema = z
  .object({
    id: zFormId,
    label: zRequiredText(300),
    type: z.enum(FORM_QUESTION_TYPES),
    options: z
      .array(zRequiredText(OPTION_MAX))
      .max(MAX_QUESTION_OPTIONS, { error: `Al massimo ${MAX_QUESTION_OPTIONS} opzioni` })
      .optional(),
    required: z.boolean().optional(),
    help: zText(500).optional(),
  })
  .superRefine((question, ctx) => {
    if (!hasOptions(question.type)) return
    const options = question.options ?? []
    if (options.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `«${question.label}» ha bisogno di almeno due opzioni`,
      })
    }
    const twice = options.find((option, i) => options.findIndex(other => sameOption(other, option)) !== i)
    if (twice) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: `L’opzione «${twice}» compare due volte` })
    }
  })
  // Stored without empty parts: no options outside a choice, no empty help, `required` only when true.
  .transform(({ options, required, help, ...question }): FormQuestion => ({
    ...question,
    ...(hasOptions(question.type) ? { options } : {}),
    ...(required ? { required: true } : {}),
    ...(help ? { help } : {}),
  }))

const formSectionSchema = z
  .object({
    id: zFormId,
    title: zRequiredText(120),
    description: zText(500).optional(),
    questions: z.array(formQuestionSchema).max(MAX_FORM_QUESTIONS),
  })
  .transform(({ description, ...section }) => ({ ...section, ...(description ? { description } : {}) }))

/** An option the editor renamed: the answers that chose `from` now say `to`. */
const renameSchema = z.object({
  questionId: zFormId,
  from: z.string().max(OPTION_MAX),
  to: z.string().trim().max(OPTION_MAX),
})
export type OptionRename = z.output<typeof renameSchema>

/** PUT /api/admin/family-form: the whole form, with the revision it was loaded at. */
export const familyFormSaveSchema = z
  .object({
    revision: z.number().int().min(0),
    sections: z
      .array(formSectionSchema)
      .min(1, { error: 'Il modulo ha bisogno di almeno una sezione' })
      .max(MAX_FORM_SECTIONS, { error: `Al massimo ${MAX_FORM_SECTIONS} sezioni` }),
    renames: z.array(renameSchema).max(500).default([]),
  })
  .superRefine(({ sections }, ctx) => {
    const sectionIds = new Set<string>()
    const questionIds = new Set<string>()
    let total = 0
    for (const section of sections) {
      if (sectionIds.has(section.id)) {
        ctx.addIssue({ code: 'custom', message: 'Due sezioni hanno lo stesso identificativo' })
      }
      sectionIds.add(section.id)
      if (!section.questions.length) {
        ctx.addIssue({
          code: 'custom',
          message: `La sezione «${section.title}» non ha domande: aggiungine una o togli la sezione`,
        })
      }
      for (const question of section.questions) {
        if (questionIds.has(question.id)) {
          ctx.addIssue({ code: 'custom', message: `La domanda «${question.label}» compare due volte` })
        }
        questionIds.add(question.id)
        total++
      }
    }
    if (total > MAX_FORM_QUESTIONS) {
      ctx.addIssue({ code: 'custom', message: `Al massimo ${MAX_FORM_QUESTIONS} domande in tutto il modulo` })
    }
  })
export type FamilyFormSaveInput = z.input<typeof familyFormSaveSchema>
export type FamilyFormSaveValues = z.output<typeof familyFormSaveSchema>
