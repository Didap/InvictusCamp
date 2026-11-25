// «Formazione» (docs/spec.md 3.4): the trainings the administration proposes, and the staff and v-team who say they
// are interested. The administration adds, renames and deletes the proposals; each person ticks their own. Explicit
// imports only, so the database tests can load it.
import { and, asc, eq, sql } from 'drizzle-orm'
import type { TrainingOptionInput } from '../../shared/schemas/staff'
import type { MyTrainingOption, TrainingOptionDto } from '../../shared/types/staff'
import { fullName } from '../../shared/utils/format'
import { staffProfiles, trainingInterests, trainingOptions, users } from '../db/schema'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { httpError, type Actor } from './users'

const NOT_FOUND = 'Proposta di formazione non trovata'
const ORDER = [asc(trainingOptions.position), asc(trainingOptions.createdAt)]

/** The proposals with who is interested, for the administration. */
export async function trainingOptionsWithPeople(db: DbOrTx): Promise<TrainingOptionDto[]> {
  const [options, interests] = await Promise.all([
    db
      .select()
      .from(trainingOptions)
      .orderBy(...ORDER),
    db
      .select({
        optionId: trainingInterests.optionId,
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        team: staffProfiles.team,
      })
      .from(trainingInterests)
      .innerJoin(users, eq(users.id, trainingInterests.userId))
      .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .orderBy(asc(users.lastName), asc(users.firstName)),
  ])
  return options.map(option => ({
    id: option.id,
    title: option.title,
    description: option.description,
    people: interests
      .filter(interest => interest.optionId === option.id)
      .map(interest => ({ userId: interest.userId, name: fullName(interest), team: interest.team })),
  }))
}

export async function createTrainingOption(db: DbOrTx, input: TrainingOptionInput, actor: Actor): Promise<string> {
  const [last] = await db
    .select({ position: sql<number | null>`max(${trainingOptions.position})` })
    .from(trainingOptions)
  const [row] = await db
    .insert(trainingOptions)
    .values({ title: input.title, description: input.description, position: (last?.position ?? -1) + 1 })
    .returning({ id: trainingOptions.id })
  await audit(db, 'create', row!.id, { title: input.title }, actor)
  return row!.id
}

export async function updateTrainingOption(
  db: DbOrTx,
  id: string,
  input: TrainingOptionInput,
  actor: Actor,
): Promise<void> {
  const [row] = await db
    .update(trainingOptions)
    .set({ title: input.title, description: input.description })
    .where(eq(trainingOptions.id, id))
    .returning({ id: trainingOptions.id })
  if (!row) throw httpError(404, NOT_FOUND)
  await audit(db, 'update', id, { title: input.title }, actor)
}

/** Deletes a proposal and the interests in it (the audit keeps how many). */
export async function deleteTrainingOption(db: DbOrTx, id: string, actor: Actor): Promise<void> {
  const [people] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trainingInterests)
    .where(eq(trainingInterests.optionId, id))
  const [row] = await db
    .delete(trainingOptions)
    .where(eq(trainingOptions.id, id))
    .returning({ title: trainingOptions.title })
  if (!row) throw httpError(404, NOT_FOUND)
  await audit(db, 'delete', id, { title: row.title, people: people?.count ?? 0 }, actor)
}

/** The proposals for the signed-in person, each with whether they are interested. */
export async function myTraining(db: DbOrTx, userId: string): Promise<MyTrainingOption[]> {
  const rows = await db
    .select({ option: trainingOptions, interest: trainingInterests.id })
    .from(trainingOptions)
    .leftJoin(
      trainingInterests,
      and(eq(trainingInterests.optionId, trainingOptions.id), eq(trainingInterests.userId, userId)),
    )
    .orderBy(...ORDER)
  return rows.map(({ option, interest }) => ({
    id: option.id,
    title: option.title,
    description: option.description,
    interested: interest !== null,
  }))
}

/** Interested in a proposal, or not any more. */
export async function setTrainingInterest(
  db: DbOrTx,
  input: { userId: string; optionId: string; interested: boolean },
): Promise<void> {
  const [option] = await db
    .select({ id: trainingOptions.id })
    .from(trainingOptions)
    .where(eq(trainingOptions.id, input.optionId))
  if (!option) throw httpError(404, NOT_FOUND)
  if (input.interested) {
    await db.insert(trainingInterests).values({ optionId: input.optionId, userId: input.userId }).onConflictDoNothing()
  } else {
    await db
      .delete(trainingInterests)
      .where(and(eq(trainingInterests.optionId, input.optionId), eq(trainingInterests.userId, input.userId)))
  }
}

/** The titles of the proposals a person is interested in (their admin page). */
export async function trainingTitlesOf(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db
    .select({ title: trainingOptions.title })
    .from(trainingInterests)
    .innerJoin(trainingOptions, eq(trainingOptions.id, trainingInterests.optionId))
    .where(eq(trainingInterests.userId, userId))
    .orderBy(...ORDER)
  return rows.map(row => row.title)
}

function audit(
  db: DbOrTx,
  change: 'create' | 'update' | 'delete',
  id: string,
  data: Record<string, unknown>,
  actor: Actor,
) {
  return writeAudit(db, {
    actorUserId: actor.userId,
    action: `training.${change}`,
    entityType: 'training_option',
    entityId: id,
    data,
    ip: actor.ip ?? null,
  })
}
