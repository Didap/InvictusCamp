import type { FormQuestion } from '#shared/content/family-form'
import type { FormAnswers } from '#shared/types/domain'

/** The inputs of the questionnaire, one record per kind of field: every input gets a value of its own type. */
export interface AnswerFields {
  texts: Record<string, string>
  choices: Record<string, string[]>
  yesNo: Record<string, boolean | undefined>
}

/**
 * The inputs filled with the stored answers that still fit the questions: an option the administration
 * took out is not ticked, so the next save does not send it back.
 */
export function answerFields(questions: readonly FormQuestion[], stored: FormAnswers = {}): AnswerFields {
  const fields: AnswerFields = { texts: {}, choices: {}, yesNo: {} }
  for (const question of questions) {
    const answer = stored[question.id]
    if (question.type === 'multiselect') {
      fields.choices[question.id] = Array.isArray(answer)
        ? answer.filter(option => question.options?.includes(option))
        : []
    } else if (question.type === 'boolean') {
      fields.yesNo[question.id] = typeof answer === 'boolean' ? answer : undefined
    } else if (question.type === 'select') {
      fields.texts[question.id] = typeof answer === 'string' && question.options?.includes(answer) ? answer : ''
    } else fields.texts[question.id] = typeof answer === 'string' ? answer : ''
  }
  return fields
}

/** The answers as the API takes them. */
export function fieldAnswers(questions: readonly FormQuestion[], fields: AnswerFields): FormAnswers {
  const result: FormAnswers = {}
  for (const question of questions) {
    if (question.type === 'multiselect') result[question.id] = [...(fields.choices[question.id] ?? [])]
    else if (question.type === 'boolean') result[question.id] = fields.yesNo[question.id] ?? null
    else result[question.id] = fields.texts[question.id] ?? ''
  }
  return result
}
