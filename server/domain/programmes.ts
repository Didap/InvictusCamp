// The week programme (docs/spec.md 3.10): one per year, and the copy a session may have of it. The
// administration edits both; families and staff of the session read the one the session uses, without
// the planning aids. Explicit imports only, so the database tests can load this file.
import { and, eq, ne, or, sql } from 'drizzle-orm'
import { emptyWeek, programmeTemplate } from '../../shared/content/programme-template'
import type { ProgrammeCreateInput, ProgrammeSaveValues } from '../../shared/schemas/programmes'
import type { ProgrammeContent } from '../../shared/types/domain'
import type { ProgrammeDto, ProgrammeView, ProgrammeYearItem, SessionProgrammeDto } from '../../shared/types/programmes'
import type { SessionStatus } from '../../shared/utils/constants'
import { rangeDays } from '../../shared/utils/dates'
import { fullName } from '../../shared/utils/format'
import { canFamilyReadProgramme, canStaffReadProgramme } from '../../shared/utils/programme'
import { isSessionEditable } from '../../shared/utils/session-status'
import { campSessions, programmes, sessionFamilies, sessionStaff, users } from '../db/schema'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import type { Actor } from './families'

type SessionRow = Pick<typeof campSessions.$inferSelect, 'id' | 'title' | 'startDate' | 'endDate' | 'status'>

/** The year whose programme a session uses: the year it starts in. */
function sessionYear(session: Pick<SessionRow, 'startDate'>): number {
  return Number(session.startDate.slice(0, 4))
}

/**
 * What a family or a staff member reads: for families, no internal notes and no staff-only blocks.
 */
export function programmeForViewer(content: ProgrammeContent, viewer: 'family' | 'staff'): ProgrammeContent {
  return {
    activities: content.activities,
    days: content.days.map(day => ({
      ...day,
      blocks: day.blocks
        .filter(block => viewer === 'staff' || block.kind !== 'staff')
        .map(block => (viewer === 'staff' ? block : { ...block, staffNote: '' })),
    })),
  }
}

// ─── Reading ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The programme of a year, or the one a session uses: its copy, else, while the session can still
 * change, the programme of its year. A completed or cancelled session reads only its copy, made when
 * it closed (freezeSessionProgramme), so later changes to the year never rewrite it.
 */
async function findProgramme(
  db: DbOrTx,
  owner: { year: number } | { session: Pick<SessionRow, 'id' | 'startDate' | 'status'> },
): Promise<ProgrammeDto | null> {
  let where
  if ('year' in owner) where = eq(programmes.year, owner.year)
  else if (isSessionEditable(owner.session.status)) {
    where = or(eq(programmes.sessionId, owner.session.id), eq(programmes.year, sessionYear(owner.session)))
  } else where = eq(programmes.sessionId, owner.session.id)
  const [row] = await db
    .select({
      id: programmes.id,
      year: programmes.year,
      sessionId: programmes.sessionId,
      content: programmes.content,
      revision: programmes.revision,
      updatedAt: programmes.updatedAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(programmes)
    .leftJoin(users, eq(users.id, programmes.updatedBy))
    .where(where)
    .orderBy(sql`${programmes.sessionId} nulls last`)
    .limit(1)
  if (!row) return null
  const { firstName, lastName, updatedAt, ...programme } = row
  return {
    ...programme,
    updatedAt: updatedAt.toISOString(),
    updatedByName: fullName({ firstName, lastName }) || null,
  }
}

async function requireSession(db: DbOrTx, sessionId: string): Promise<SessionRow> {
  const [session] = await db
    .select({
      id: campSessions.id,
      title: campSessions.title,
      startDate: campSessions.startDate,
      endDate: campSessions.endDate,
      status: campSessions.status,
    })
    .from(campSessions)
    .where(eq(campSessions.id, sessionId))
    .limit(1)
  if (!session) throw new DomainError(404, 'Sessione non trovata')
  return session
}

/** The years with a programme and the years with sessions but no programme yet, latest first. */
export async function listYearProgrammes(db: DbOrTx): Promise<ProgrammeYearItem[]> {
  const [rows, sessions] = await Promise.all([
    db
      .select({ year: programmes.year, sessionId: programmes.sessionId, updatedAt: programmes.updatedAt })
      .from(programmes),
    db
      .select({ id: campSessions.id, startDate: campSessions.startDate })
      .from(campSessions)
      .where(ne(campSessions.status, 'cancelled')),
  ])
  const withCopy = new Set(rows.map(row => row.sessionId))
  const items = new Map<number, ProgrammeYearItem>()
  for (const row of rows) {
    if (row.year)
      items.set(row.year, { year: row.year, updatedAt: row.updatedAt.toISOString(), sessions: 0, copies: 0 })
  }
  for (const session of sessions) {
    const year = sessionYear(session)
    const item = items.get(year) ?? { year, updatedAt: null, sessions: 0, copies: 0 }
    item.sessions++
    if (withCopy.has(session.id)) item.copies++
    items.set(year, item)
  }
  return [...items.values()].sort((a, b) => b.year - a.year)
}

export async function getYearProgramme(db: DbOrTx, year: number): Promise<ProgrammeDto> {
  const programme = await findProgramme(db, { year })
  if (!programme) throw new DomainError(404, `Il programma del ${year} non c’è ancora`)
  return programme
}

/** The programme tab of a session: its copy, else the programme of its year, else none. */
export async function adminSessionProgramme(db: DbOrTx, sessionId: string): Promise<SessionProgrammeDto> {
  const session = await requireSession(db, sessionId)
  const programme = await findProgramme(db, { session })
  return {
    year: sessionYear(session),
    dates: rangeDays(session),
    editable: isSessionEditable(session.status),
    source: !programme ? 'none' : programme.sessionId ? 'session' : 'year',
    programme,
  }
}

const NOT_AVAILABLE = 'Programma non disponibile'

/** What a family or a staff member of the session reads, when `allowed` lets them (spec 3.10). */
async function viewerProgramme(
  db: DbOrTx,
  sessionId: string,
  viewer: 'family' | 'staff',
  allowed: (session: SessionStatus) => boolean,
): Promise<ProgrammeView> {
  const session = await requireSession(db, sessionId)
  if (!allowed(session.status)) throw new DomainError(404, NOT_AVAILABLE)
  const programme = await findProgramme(db, { session })
  return { session, content: programme ? programmeForViewer(programme.content, viewer) : null }
}

/** A family reads the programme of a session it is invited to or confirmed in (not cancelled). */
export async function familyProgramme(
  db: DbOrTx,
  input: { familyId: string; sessionId: string },
): Promise<ProgrammeView> {
  const [row] = await db
    .select({ status: sessionFamilies.status })
    .from(sessionFamilies)
    .where(and(eq(sessionFamilies.familyId, input.familyId), eq(sessionFamilies.sessionId, input.sessionId)))
    .limit(1)
  if (!row) throw new DomainError(404, NOT_AVAILABLE)
  return viewerProgramme(db, input.sessionId, 'family', session => canFamilyReadProgramme(row.status, session))
}

/** A staff member reads the programme of a session whose convocation they accepted (not cancelled). */
export async function staffProgramme(db: DbOrTx, input: { userId: string; sessionId: string }): Promise<ProgrammeView> {
  const [row] = await db
    .select({ status: sessionStaff.status })
    .from(sessionStaff)
    .where(and(eq(sessionStaff.userId, input.userId), eq(sessionStaff.sessionId, input.sessionId)))
    .limit(1)
  if (!row) throw new DomainError(404, NOT_AVAILABLE)
  return viewerProgramme(db, input.sessionId, 'staff', session => canStaffReadProgramme(row.status, session))
}

// ─── Writing ───────────────────────────────────────────────────────────────────────────────────────

/** Creates the programme of a year from the model week, empty, or as a copy of another year. */
export async function createYearProgramme(
  db: DbOrTx,
  input: { values: ProgrammeCreateInput; actor: Actor },
): Promise<void> {
  const { year, from } = input.values
  let content: ProgrammeContent
  if (from === 'template') content = programmeTemplate()
  else if (from === 'empty') content = emptyWeek()
  else content = (await getYearProgramme(db, from)).content
  const [row] = await db
    .insert(programmes)
    .values({ year, content, updatedBy: input.actor.userId })
    .onConflictDoNothing()
    .returning({ id: programmes.id })
  if (!row) throw new DomainError(409, `Il programma del ${year} c’è già`)
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'programme.create',
    entityType: 'programme',
    entityId: row.id,
    data: { year, from },
    ip: input.actor.ip,
  })
}

/**
 * Saves over the programme and revision the editor loaded. Another revision, or another programme (a
 * session copy dropped and made again), means someone saved in between: nothing is overwritten.
 */
async function saveProgramme(
  db: DbOrTx,
  current: ProgrammeDto,
  input: { values: ProgrammeSaveValues; actor: Actor },
): Promise<void> {
  const { id, revision, content } = input.values
  const [row] =
    id === current.id
      ? await db
          .update(programmes)
          .set({ content, revision: sql`${programmes.revision} + 1`, updatedBy: input.actor.userId })
          .where(and(eq(programmes.id, id), eq(programmes.revision, revision)))
          .returning({ id: programmes.id })
      : []
  if (!row) {
    throw new DomainError(
      409,
      'Qualcun altro ha salvato il programma mentre lo modificavi. Ricarica la pagina per vedere la sua versione.',
    )
  }
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'programme.update',
    entityType: 'programme',
    entityId: id,
    data: current.year ? { year: current.year } : { sessionId: current.sessionId },
    ip: input.actor.ip,
  })
}

export async function saveYearProgramme(
  db: DbOrTx,
  input: { year: number; values: ProgrammeSaveValues; actor: Actor },
): Promise<ProgrammeDto> {
  await saveProgramme(db, await getYearProgramme(db, input.year), input)
  return getYearProgramme(db, input.year)
}

async function requireEditableSession(db: DbOrTx, sessionId: string): Promise<SessionRow> {
  const session = await requireSession(db, sessionId)
  if (!isSessionEditable(session.status)) {
    throw new DomainError(409, 'Il programma di una sessione conclusa o annullata non si modifica più')
  }
  return session
}

/** The session's copy of `content`; null when it already has one. */
async function insertCopy(
  db: DbOrTx,
  sessionId: string,
  content: ProgrammeContent,
  userId: string | null,
): Promise<string | null> {
  const [row] = await db
    .insert(programmes)
    .values({ sessionId, content, updatedBy: userId })
    .onConflictDoNothing()
    .returning({ id: programmes.id })
  return row?.id ?? null
}

/** Gives the session a copy of the programme of its year, to change for this session only. */
export async function copyProgrammeToSession(db: DbOrTx, input: { sessionId: string; actor: Actor }): Promise<void> {
  const session = await requireEditableSession(db, input.sessionId)
  const year = sessionYear(session)
  const ofYear = await findProgramme(db, { year })
  if (!ofYear) throw new DomainError(409, `Prima crea il programma del ${year}`)
  const id = await insertCopy(db, session.id, ofYear.content, input.actor.userId)
  if (!id) throw new DomainError(409, 'La sessione ha già un programma suo')
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'programme.copy',
    entityType: 'programme',
    entityId: id,
    data: { sessionId: session.id, year },
    ip: input.actor.ip,
  })
}

/**
 * A session that closes (completed or cancelled) keeps the programme it had: without a copy it gets
 * one of its year's programme (sessions.ts, transitionSession).
 */
export async function freezeSessionProgramme(db: DbOrTx, session: Pick<SessionRow, 'id' | 'startDate'>): Promise<void> {
  const ofYear = await findProgramme(db, { year: sessionYear(session) })
  if (ofYear) await insertCopy(db, session.id, ofYear.content, null)
}

export async function saveSessionProgramme(
  db: DbOrTx,
  input: { sessionId: string; values: ProgrammeSaveValues; actor: Actor },
): Promise<SessionProgrammeDto> {
  const session = await requireEditableSession(db, input.sessionId)
  const current = await findProgramme(db, { session })
  if (!current?.sessionId) throw new DomainError(404, 'La sessione usa il programma dell’anno: crea prima una copia')
  await saveProgramme(db, current, input)
  return adminSessionProgramme(db, input.sessionId)
}

/** Removes the session's copy: the session goes back to the programme of its year. */
export async function dropSessionProgramme(db: DbOrTx, input: { sessionId: string; actor: Actor }): Promise<void> {
  await requireEditableSession(db, input.sessionId)
  const [row] = await db
    .delete(programmes)
    .where(eq(programmes.sessionId, input.sessionId))
    .returning({ id: programmes.id })
  if (!row) return
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'programme.drop',
    entityType: 'programme',
    entityId: row.id,
    data: { sessionId: input.sessionId },
    ip: input.actor.ip,
  })
}
