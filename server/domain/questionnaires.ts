// The questionnaire «Dati della famiglia» (docs/spec.md 3.8): the administration changes it from
// /admin/famiglie/modulo; until the first save it is the form of the code (shared/content/family-form.ts).
// Answers are stored by question id and a choice as the text of its option, so a save keeps them right:
// renamed options rewrite the answers that chose them, a question taken out goes to `retired` (the
// record of a family still shows what it answered), the type of a question already answered stays (text
// and long text excepted), and the questions the code reads keep id, type, options and requirement.
import { eq, or, sql } from 'drizzle-orm'
import {
  DEFAULT_FAMILY_FORM,
  LOCKED_QUESTIONS,
  formQuestions,
  type FamilyFormContent,
  type FormQuestion,
  type FormSection,
} from '../../shared/content/family-form'
import type { FamilyFormSaveValues, OptionRename } from '../../shared/schemas/questionnaires'
import type { FormAnswers } from '../../shared/types/domain'
import type { FamilyFormDto, FamilyFormSaveResult } from '../../shared/types/families'
import { fullName } from '../../shared/utils/format'
import { families, questionnaires, users } from '../db/schema'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import type { Actor } from './families'

const FAMILY_FORM = 'family'

export async function getFamilyForm(db: DbOrTx): Promise<FamilyFormDto> {
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
    content: row.content,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: fullName(row) || null,
  }
}

/** The sections the family fills in (GET /api/family/form). */
export async function familyFormSections(db: DbOrTx): Promise<FormSection[]> {
  return (await getFamilyForm(db)).content.sections
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

/** Text and long text store the same answer; any other change of type would leave the answers wrong. */
const TEXT_TYPES = new Set(['text', 'textarea'])
function compatibleType(before: FormQuestion, after: FormQuestion): boolean {
  return before.type === after.type || (TEXT_TYPES.has(before.type) && TEXT_TYPES.has(after.type))
}

function checkLocked(next: Map<string, FormQuestion>, before: Map<string, FormQuestion>): void {
  const original = new Map(formQuestions(DEFAULT_FAMILY_FORM).map(question => [question.id, question]))
  for (const [id, reason] of Object.entries(LOCKED_QUESTIONS)) {
    const locked = original.get(id)!
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
      if (id in answers) answers[id] = renamedAnswer(answers[id]!, map, next.get(id)!.options ?? [])
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
  const current = await getFamilyForm(db)
  const conflict = () =>
    new DomainError(
      409,
      'Qualcun altro ha salvato il modulo mentre lo modificavi. Ricarica la pagina per vedere la sua versione.',
    )
  if (input.values.revision !== current.revision) throw conflict()

  const was = formQuestions(current.content)
  const previous = new Map(was.map(question => [question.id, question]))
  // A retired question that comes back keeps its type too: its answers are still there.
  const before = new Map([...current.content.retired.map(question => [question.id, question] as const), ...previous])
  const next = new Map(formQuestions(input.values).map(question => [question.id, question]))
  checkLocked(next, before)
  for (const question of next.values()) {
    const old = before.get(question.id)
    if (old && !compatibleType(old, question)) {
      throw new DomainError(
        400,
        `Il tipo della domanda «${question.label}» non si cambia: le famiglie hanno già risposto. Togli la domanda e creane una nuova.`,
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
      // The version before the save: with the form saved, every version can be told again.
      changed: [...next.values()].flatMap(question => {
        const old = previous.get(question.id)
        return old && !sameQuestion(old, question) ? [{ id: question.id, before: old }] : []
      }),
      renamedOptions: [...maps.values()].reduce((sum, map) => sum + map.size, 0),
      answersUpdated,
    },
    ip: input.actor.ip,
  })
  return { form: await getFamilyForm(db), answersUpdated }
}
