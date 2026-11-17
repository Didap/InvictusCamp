// The questionnaire «Dati della famiglia» (docs/spec.md 3.8): the administration changes it from
// /admin/famiglie/modulo; until the first save it is the form of the code (shared/content/family-form.ts).
// Answers are stored by question id and a choice as the text of its option, so a save keeps them right:
// renamed options rewrite the answers that chose them, a question taken out goes to `retired` (the
// record of a family still shows what it answered), the kind of answer of a question only widens (short
// text to long text), and the questions the code reads take id, type, options and requirement from the
// code, always: only their text, help and place are the administration's.
import { eq, or, sql } from 'drizzle-orm'
import {
  DEFAULT_FAMILY_FORM,
  LOCKED_QUESTIONS,
  formQuestions,
  lockedReason,
  type FamilyFormContent,
  type FormQuestion,
} from '../../shared/content/family-form'
import { typesFor, type FamilyFormSaveValues, type OptionRename } from '../../shared/schemas/questionnaires'
import type { FormAnswers } from '../../shared/types/domain'
import type { FamilyFormDto, FamilyFormSaveResult } from '../../shared/types/families'
import { fullName } from '../../shared/utils/format'
import { families, questionnaires, users } from '../db/schema'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import type { Actor } from './families'

const FAMILY_FORM = 'family'

const CODE_QUESTIONS = new Map(formQuestions(DEFAULT_FAMILY_FORM).map(question => [question.id, question]))

/** The locked questions with type, options and requirement of the code, text and help of the saved form. */
function withCodeLocks(content: FamilyFormContent): FamilyFormContent {
  const lock = (question: FormQuestion): FormQuestion => {
    if (!lockedReason(question.id)) return question
    const { type, options, required } = CODE_QUESTIONS.get(question.id)!
    const { options: _, required: __, ...text } = question
    return { ...text, type, ...(options ? { options } : {}), ...(required ? { required } : {}) }
  }
  return {
    ...content,
    sections: content.sections.map(section => ({ ...section, questions: section.questions.map(lock) })),
  }
}

/**
 * The questionnaire as it is now. Inside a transaction, `lock` holds it until the commit: 'share' for a
 * family's save (it validates against this version), 'update' for the administration's save, which waits
 * for those saves and makes them wait. A lock on a key, not on the row: there is no row before the first save.
 */
export async function getFamilyForm(db: DbOrTx, lock?: 'share' | 'update'): Promise<FamilyFormDto> {
  if (lock === 'share') await db.execute(sql`select pg_advisory_xact_lock_shared(hashtext('questionnaire:family'))`)
  if (lock === 'update') await db.execute(sql`select pg_advisory_xact_lock(hashtext('questionnaire:family'))`)
  const [row] = await db
    .select({
      content: questionnaires.content,
      revision: questionnaires.revision,
      updatedAt: questionnaires.updatedAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(questionnaires)
    .leftJoin(users, eq(users.id, questionnaires.updatedBy))
    .where(eq(questionnaires.key, FAMILY_FORM))
    .limit(1)
  if (!row) return { content: DEFAULT_FAMILY_FORM, revision: 0, updatedAt: null, updatedByName: null }
  return {
    content: withCodeLocks(row.content),
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: fullName(row) || null,
  }
}

const sameList = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && a.every((item, i) => item === b[i])

/** Same question, whatever the order of the keys (jsonb reorders them). */
function sameQuestion(a: FormQuestion, b: FormQuestion): boolean {
  return (
    a.label === b.label &&
    (a.help ?? '') === (b.help ?? '') &&
    a.type === b.type &&
    sameList(a.options, b.options) &&
    !!a.required === !!b.required
  )
}

function checkLocked(next: Map<string, FormQuestion>, before: Map<string, FormQuestion>): void {
  for (const [id, reason] of Object.entries(LOCKED_QUESTIONS)) {
    const locked = CODE_QUESTIONS.get(id)!
    const question = next.get(id)
    if (!question) {
      throw new DomainError(400, `La domanda «${(before.get(id) ?? locked).label}» non si toglie: ${reason}`)
    }
    if (
      question.type !== locked.type ||
      !sameList(question.options, locked.options) ||
      !!question.required !== !!locked.required
    ) {
      throw new DomainError(400, `Della domanda «${question.label}» si cambiano solo il testo e l’aiuto: ${reason}`)
    }
  }
}

/** The renames by question: old option → new option, checked against both versions of the question. */
function renameMaps(
  renames: OptionRename[],
  next: Map<string, FormQuestion>,
  before: Map<string, FormQuestion>,
): Map<string, Map<string, string>> {
  const maps = new Map<string, Map<string, string>>()
  for (const { questionId, from, to } of renames) {
    if (from === to) continue
    const old = before.get(questionId)
    const question = next.get(questionId)
    if (!old?.options?.includes(from) || !question?.options?.includes(to)) {
      throw new DomainError(400, 'Il modulo è cambiato mentre lo modificavi: ricarica la pagina e rifai le modifiche')
    }
    const map = maps.get(questionId) ?? new Map<string, string>()
    map.set(from, to)
    maps.set(questionId, map)
  }
  return maps
}

/** One answer with the renamed options; a multiple choice stays in the order of the options, each once. */
function renamedAnswer(value: FormAnswers[string], map: Map<string, string>, options: string[]): FormAnswers[string] {
  if (typeof value === 'string') return map.get(value) ?? value
  if (!Array.isArray(value)) return value
  const picked = new Set(value.map(option => map.get(option) ?? option))
  return [...options.filter(option => picked.has(option)), ...[...picked].filter(option => !options.includes(option))]
}

/** Rewrites the answers that chose a renamed option; returns how many families changed. */
async function renameAnswers(
  db: DbOrTx,
  maps: Map<string, Map<string, string>>,
  next: Map<string, FormQuestion>,
): Promise<number> {
  if (!maps.size) return 0
  const rows = await db
    .select({ id: families.id, formAnswers: families.formAnswers })
    .from(families)
    .where(or(...[...maps.keys()].map(id => sql`${families.formAnswers} ? ${id}`)))
    .for('update')
  let changed = 0
  for (const row of rows) {
    const answers = { ...row.formAnswers }
    for (const [id, map] of maps) {
      if (Object.hasOwn(answers, id)) answers[id] = renamedAnswer(answers[id]!, map, next.get(id)!.options ?? [])
    }
    if (JSON.stringify(answers) === JSON.stringify(row.formAnswers)) continue
    await db.update(families).set({ formAnswers: answers }).where(eq(families.id, row.id))
    changed++
  }
  return changed
}

/**
 * Saves the questionnaire: refused (409) when someone saved after it was loaded. The families see the new
 * form at once; those who had already confirmed their data stay confirmed, and a new required question
 * waits for their next save.
 */
export async function saveFamilyForm(
  db: DbOrTx,
  input: { values: FamilyFormSaveValues; actor: Actor },
): Promise<FamilyFormSaveResult> {
  const current = await getFamilyForm(db, 'update')
  const conflict = () =>
    new DomainError(
      409,
      'Qualcun altro ha salvato il modulo mentre lo modificavi. Ricarica la pagina per vedere la sua versione.',
    )
  if (input.values.revision !== current.revision) throw conflict()

  const was = formQuestions(current.content)
  const previous = new Map(was.map(question => [question.id, question]))
  // A retired question that comes back keeps its kind of answer too: its answers are still there.
  const before = new Map([...current.content.retired.map(question => [question.id, question] as const), ...previous])
  const next = new Map(formQuestions(input.values).map(question => [question.id, question]))
  checkLocked(next, before)
  for (const question of next.values()) {
    const old = before.get(question.id)
    if (old && !typesFor(old.type).includes(question.type)) {
      throw new DomainError(
        400,
        `Il tipo di risposta della domanda «${question.label}» non si cambia così: le famiglie hanno già risposto. Togli la domanda e creane una nuova.`,
      )
    }
  }
  const maps = renameMaps(input.values.renames, next, before)

  const removed = was.filter(question => !next.has(question.id))
  const content: FamilyFormContent = {
    sections: input.values.sections,
    retired: [...current.content.retired.filter(question => !next.has(question.id)), ...removed],
  }
  const [row] =
    current.revision === 0
      ? await db
          .insert(questionnaires)
          .values({ key: FAMILY_FORM, content, updatedBy: input.actor.userId })
          .onConflictDoNothing()
          .returning({ revision: questionnaires.revision })
      : await db
          .update(questionnaires)
          .set({ content, revision: sql`${questionnaires.revision} + 1`, updatedBy: input.actor.userId })
          .where(sql`${questionnaires.key} = ${FAMILY_FORM} and ${questionnaires.revision} = ${current.revision}`)
          .returning({ revision: questionnaires.revision })
  if (!row) throw conflict()

  const answersUpdated = await renameAnswers(db, maps, next)
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'family_form.update',
    entityType: 'questionnaire',
    data: {
      key: FAMILY_FORM,
      revision: row.revision,
      added: [...next.keys()].filter(id => !previous.has(id)),
      removed: removed.map(question => question.id),
      changed: [...next.values()]
        .filter(question => previous.has(question.id) && !sameQuestion(previous.get(question.id)!, question))
        .map(question => question.id),
      renamedOptions: [...maps.values()].reduce((sum, map) => sum + map.size, 0),
      answersUpdated,
      // The form before this save, sections and order included: the saved rows tell every version.
      previous: current.content.sections,
    },
    ip: input.actor.ip,
  })
  return { form: await getFamilyForm(db), answersUpdated }
}
