import type { FormQuestion } from '#shared/content/family-form'
import { fitAnswers } from '#shared/schemas/families'
import type { FormAnswers } from '#shared/types/domain'

/** The inputs of the questionnaire, one record per kind of field: every input gets a value of its own type. */
export interface AnswerFields {
  texts: Record<string, string>
  choices: Record<string, string[]>
  yesNo: Record<string, boolean | undefined>
}

/**
 * The inputs filled with the stored answers that still fit the questions (fitAnswers): an option the
 * administration took out is not ticked, so the next save does not send it back.
 */
export function answerFields(questions: readonly FormQuestion[], stored: FormAnswers = {}): AnswerFields {
  const fit = fitAnswers(stored, questions)
  const fields: AnswerFields = { texts: {}, choices: {}, yesNo: {} }
  for (const { id, type } of questions) {
    const answer = fit[id]
    if (type === 'multiselect') fields.choices[id] = Array.isArray(answer) ? [...answer] : []
    else if (type === 'boolean') fields.yesNo[id] = typeof answer === 'boolean' ? answer : undefined
    else fields.texts[id] = typeof answer === 'string' ? answer : ''
  }
  return fields
}

/** The answers as the API takes them. */
export function fieldAnswers(questions: readonly FormQuestion[], fields: AnswerFields): FormAnswers {
  const result: FormAnswers = {}
  for (const { id, type } of questions) {
    if (type === 'multiselect') result[id] = [...(fields.choices[id] ?? [])]
    else if (type === 'boolean') result[id] = fields.yesNo[id] ?? null
    else result[id] = fields.texts[id] ?? ''
  }
  return result
}
