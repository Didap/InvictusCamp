// The week programme (docs/spec.md 3.10): one per year, and the copy a session may have of it. The
// administration edits both; families and staff of the session read the one the session uses, without
// the planning aids. Explicit imports only, so the database tests can load this file.
import { and, eq, isNotNull, ne, or, sql } from 'drizzle-orm'
import { emptyWeek, programmeTemplate } from '../../shared/content/programme-template'
import type { ProgrammeCreateInput, ProgrammeSaveValues } from '../../shared/schemas/programmes'
import type { ProgrammeContent } from '../../shared/types/domain'
import type { ProgrammeDto, ProgrammeView, ProgrammeYearItem, SessionProgrammeDto } from '../../shared/types/programmes'
import { rangeDays } from '../../shared/utils/dates'
import { canFamilyReadProgramme, canStaffReadProgramme } from '../../shared/utils/programme'
import { isSessionEditable } from '../../shared/utils/session-status'
import { campSessions, programmes, sessionFamilies, sessionStaff, users } from '../db/schema'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import type { Actor } from './families'

type SessionRow = Pick<typeof campSessions.$inferSelect, 'id' | 'title' | 'startDate' | 'endDate' | 'status'>

/** The year whose programme a session uses: the year it starts in. */
export function sessionYear(session: Pick<SessionRow, 'startDate'>): number {
  return Number(session.startDate.slice(0, 4))
}

/**
 * What a family or a staff member reads: no planning aids (internal note for families, "novità" for
 * both) and, for families, no staff-only blocks.
 */
export function programmeForViewer(content: ProgrammeContent, viewer: 'family' | 'staff'): ProgrammeContent {
  return {
    activities: content.activities,
    days: content.days.map(day => ({
      ...day,
      blocks: day.blocks
        .filter(block => viewer === 'staff' || block.kind !== 'staff')
        .map(block => ({ ...block, isNew: false, staffNote: viewer === 'staff' ? block.staffNote : '' })),
    })),
  }
}

// ─── Reading ───────────────────────────────────────────────────────────────────────────────────────

const dtoColumns = {
  id: programmes.id,
  year: programmes.year,
  sessionId: programmes.sessionId,
  content: programmes.content,
  revision: programmes.revision,
  updatedAt: programmes.updatedAt,
  updatedByName: sql<string | null>`nullif(trim(concat_ws(' ', ${users.firstName}, ${users.lastName})), '')`,
}

/** The programme of a year, or the one a session uses: its copy, else the programme of its year. */
async function findProgramme(
  db: DbOrTx,
  owner: { year: number } | { session: Pick<SessionRow, 'id' | 'startDate'> },
): Promise<ProgrammeDto | null> {
  const where =
    'year' in owner
      ? eq(programmes.year, owner.year)
      : or(eq(programmes.sessionId, owner.session.id), eq(programmes.year, sessionYear(owner.session)))
  const [row] = await db
    .select(dtoColumns)
    .from(programmes)
    .leftJoin(users, eq(users.id, programmes.updatedBy))
    .where(where)
    .orderBy(sql`${programmes.sessionId} nulls last`)
    .limit(1)
  return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null
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
  const [rows, sessions, copies] = await Promise.all([
    db
      .select({ year: programmes.year, updatedAt: programmes.updatedAt })
      .from(programmes)
      .where(isNotNull(programmes.year)),
    db
      .select({ id: campSessions.id, startDate: campSessions.startDate })
      .from(campSessions)
      .where(ne(campSessions.status, 'cancelled')),
    db.select({ sessionId: programmes.sessionId }).from(programmes).where(isNotNull(programmes.sessionId)),
  ])
  const withCopy = new Set(copies.map(copy => copy.sessionId))
  const items = new Map<number, ProgrammeYearItem>()
  for (const row of rows) {
    items.set(row.year!, {
      year: row.year!,
      exists: true,
      updatedAt: row.updatedAt.toISOString(),
      sessions: 0,
      copies: 0,
    })
  }
  for (const session of sessions) {
    const year = sessionYear(session)
    const item = items.get(year) ?? { year, exists: false, updatedAt: null, sessions: 0, copies: 0 }
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

async function viewOf(db: DbOrTx, session: SessionRow, viewer: 'family' | 'staff'): Promise<ProgrammeView> {
  const programme = await findProgramme(db, { session })
  return {
    session,
    dates: rangeDays(session),
    content: programme ? programmeForViewer(programme.content, viewer) : null,
  }
}

const NOT_AVAILABLE = 'Programma non disponibile'

/** A family reads the programme of a session it is invited to or confirmed in (not cancelled). */
export async function familyProgramme(
  db: DbOrTx,
  input: { familyId: string; sessionId: string },
): Promise<ProgrammeView> {
  const [participation] = await db
    .select({ status: sessionFamilies.status })
    .from(sessionFamilies)
    .where(and(eq(sessionFamilies.familyId, input.familyId), eq(sessionFamilies.sessionId, input.sessionId)))
    .limit(1)
  if (!participation) throw new DomainError(404, NOT_AVAILABLE)
  const session = await requireSession(db, input.sessionId)
  if (!canFamilyReadProgramme(participation.status, session.status)) throw new DomainError(404, NOT_AVAILABLE)
  return viewOf(db, session, 'family')
}

/** A staff member reads the programme of a session whose convocation they accepted (not cancelled). */
export async function staffProgramme(db: DbOrTx, input: { userId: string; sessionId: string }): Promise<ProgrammeView> {
  const [convocation] = await db
    .select({ status: sessionStaff.status })
    .from(sessionStaff)
    .where(and(eq(sessionStaff.userId, input.userId), eq(sessionStaff.sessionId, input.sessionId)))
    .limit(1)
  if (!convocation) throw new DomainError(404, NOT_AVAILABLE)
  const session = await requireSession(db, input.sessionId)
  if (!canStaffReadProgramme(convocation.status, session.status)) throw new DomainError(404, NOT_AVAILABLE)
  return viewOf(db, session, 'staff')
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

/**
 * Gives the session a copy of the programme of its year. Returns the new copy's id, or null when there
 * is no programme of the year or the session already has a copy.
 */
async function insertCopy(
  db: DbOrTx,
  session: Pick<SessionRow, 'id' | 'startDate'>,
  userId: string | null,
): Promise<string | null> {
  const ofYear = await findProgramme(db, { year: sessionYear(session) })
  if (!ofYear) return null
  const [row] = await db
    .insert(programmes)
    .values({ sessionId: session.id, content: ofYear.content, updatedBy: userId })
    .onConflictDoNothing()
    .returning({ id: programmes.id })
  return row?.id ?? null
}

/** Gives the session a copy of the programme of its year, to change for this session only. */
export async function copyProgrammeToSession(db: DbOrTx, input: { sessionId: string; actor: Actor }): Promise<void> {
  const session = await requireEditableSession(db, input.sessionId)
  const year = sessionYear(session)
  if (!(await findProgramme(db, { year }))) throw new DomainError(409, `Prima crea il programma del ${year}`)
  const id = await insertCopy(db, session, input.actor.userId)
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
 * A completed session keeps the programme it had: without a copy it gets one, so that later changes
 * to the programme of its year do not rewrite what its families and staff read (sessions.ts).
 */
export async function freezeSessionProgramme(db: DbOrTx, session: Pick<SessionRow, 'id' | 'startDate'>): Promise<void> {
  await insertCopy(db, session, null)
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
