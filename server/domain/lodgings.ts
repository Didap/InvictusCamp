// The lodgings of the camp and who sleeps where in a session (docs/spec.md 3.11). The layout (lodgings) is
// entered once and used by every session. In a session a lodging hosts one family (session_families.lodgingId,
// with its unique index and check) or members of the staff and v-team (session_staff.lodgingId), never both.
// Explicit imports only, so the database tests can load this file (tests/db/lodgings.test.ts).
import { and, count, eq, ne, sql } from 'drizzle-orm'
import type { LodgingValues } from '../../shared/schemas/lodgings'
import type { FormAnswers } from '../../shared/types/domain'
import type {
  LodgingListItem,
  SessionLodgingFamily,
  SessionLodgingStaff,
  SessionLodgingsDto,
} from '../../shared/types/lodgings'
import { enumLabel } from '../../shared/utils/constants'
import { NO_CARDS, fullName } from '../../shared/utils/format'
import { accommodationNeeds, featureLabels, placeFamilies, sortLodgings } from '../../shared/utils/lodgings'
import { isSessionEditable } from '../../shared/utils/session-status'
import { campSessions, families, lodgings, sessionFamilies, sessionStaff, staffProfiles, users } from '../db/schema'
import { writeAudit } from './audit'
import { sessionCsv } from './csv'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import { memberCountSql } from './families'
import { activeStaff, findSession, holdingPlace, lockSession, requireEditable, type Actor } from './sessions'

const columns = {
  id: lodgings.id,
  name: lodgings.name,
  area: lodgings.area,
  beds: lodgings.beds,
  features: lodgings.features,
  description: lodgings.description,
}

const notFound = () => new DomainError(404, 'Alloggio non trovato')

// ─── The layout ────────────────────────────────────────────────────────────────────────────────────

/**
 * The sessions that place someone in the lodging: a family or members of the staff. Names written out:
 * with one table in the outer query Drizzle renders its columns unqualified, and `id` would mean the inner one.
 */
const sessionsUsing = sql<number>`(select count(*)::int from (
  select session_id from session_families where session_families.lodging_id = lodgings.id
  union select session_id from session_staff where session_staff.lodging_id = lodgings.id
) as used)`

/** Every lodging, in the order of the layout, with how many sessions place someone in it. */
export async function listLodgings(db: DbOrTx): Promise<LodgingListItem[]> {
  return sortLodgings(await db.select({ ...columns, sessions: sessionsUsing }).from(lodgings))
}

export async function createLodging(db: DbOrTx, input: LodgingValues): Promise<string> {
  const [row] = await db.insert(lodgings).values(input).returning({ id: lodgings.id })
  return row!.id
}

/** Changes a lodging everywhere it is used, completed sessions included: it is the same place. */
export async function updateLodging(db: DbOrTx, id: string, input: LodgingValues): Promise<void> {
  const [row] = await db.update(lodgings).set(input).where(eq(lodgings.id, id)).returning({ id: lodgings.id })
  if (!row) throw notFound()
}

/**
 * Deletes a lodging. The families placed in it in an open session are left without one (audited); a
 * lodging in the layout of a completed session is kept, so that its layout stays as it was.
 */
export async function deleteLodging(db: DbOrTx, id: string, actor: Actor): Promise<void> {
  const [lodging] = await db.select(columns).from(lodgings).where(eq(lodgings.id, id)).for('update')
  if (!lodging) throw notFound()
  const [placed, staffPlaced] = await Promise.all([
    db
      .select({ id: sessionFamilies.id, sessionId: sessionFamilies.sessionId, status: campSessions.status })
      .from(sessionFamilies)
      .innerJoin(campSessions, eq(campSessions.id, sessionFamilies.sessionId))
      .where(eq(sessionFamilies.lodgingId, id)),
    db
      .select({ id: sessionStaff.id, sessionId: sessionStaff.sessionId, status: campSessions.status })
      .from(sessionStaff)
      .innerJoin(campSessions, eq(campSessions.id, sessionStaff.sessionId))
      .where(eq(sessionStaff.lodgingId, id)),
  ])
  const closedSessions = new Set(
    [...placed, ...staffPlaced].filter(row => !isSessionEditable(row.status)).map(row => row.sessionId),
  )
  const closed = closedSessions.size
  if (closed) {
    throw new DomainError(
      409,
      `«${lodging.name}» è nello schema di ${closed === 1 ? 'una sessione conclusa' : `${closed} sessioni concluse`}: non si può eliminare`,
    )
  }
  await db.delete(lodgings).where(eq(lodgings.id, id))
  await writeAudit(db, {
    actorUserId: actor.userId,
    action: 'lodging.delete',
    entityType: 'lodging',
    entityId: id,
    data: {
      name: lodging.name,
      freed: placed.map(row => ({ participationId: row.id, sessionId: row.sessionId })),
      freedStaff: staffPlaced.map(row => ({ convocationId: row.id, sessionId: row.sessionId })),
    },
    ip: actor.ip,
  })
}

// ─── A session ─────────────────────────────────────────────────────────────────────────────────────

/** The titolari holding a place in the session, by name, with their size and needs. */
async function lodgingFamilies(db: DbOrTx, sessionId: string): Promise<SessionLodgingFamily[]> {
  const rows = await db
    .select({
      id: sessionFamilies.id,
      familyId: sessionFamilies.familyId,
      familyName: families.name,
      status: sessionFamilies.status,
      people: memberCountSql,
      // Only this answer of the family data, not the whole questionnaire.
      needs: sql<FormAnswers[string]>`${families.formAnswers} -> 'accommodationNeeds'`,
      lodgingId: sessionFamilies.lodgingId,
    })
    .from(sessionFamilies)
    .innerJoin(families, eq(families.id, sessionFamilies.familyId))
    .where(holdingPlace(sessionId))
  return rows
    .sort((a, b) => a.familyName.localeCompare(b.familyName, 'it'))
    .map(row => ({ ...row, needs: accommodationNeeds(row.needs) }))
}

/** The staff and v-team of the session still in play (activeStaff), by name. */
async function lodgingStaff(db: DbOrTx, sessionId: string): Promise<SessionLodgingStaff[]> {
  const rows = await db
    .select({
      id: sessionStaff.id,
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      team: staffProfiles.team,
      status: sessionStaff.status,
      lodgingId: sessionStaff.lodgingId,
    })
    .from(sessionStaff)
    .innerJoin(users, eq(users.id, sessionStaff.userId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(activeStaff(sessionId))
  return rows
    .map(({ firstName, lastName, team, ...row }) => ({
      ...row,
      team: team ?? 'staff',
      name: fullName({ firstName, lastName }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
}

/** The session, its layout, its families and its staff, read together. */
async function loadSession(db: DbOrTx, sessionId: string) {
  const [session, layout, placed, staff] = await Promise.all([
    findSession(db, sessionId),
    db.select(columns).from(lodgings),
    lodgingFamilies(db, sessionId),
    lodgingStaff(db, sessionId),
  ])
  return { session, lodgings: sortLodgings(layout), families: placed, staff }
}

/** GET /api/admin/sessions/:id/lodgings: the layout and the families to place in it. */
export async function sessionLodgingsOf(db: DbOrTx, sessionId: string): Promise<SessionLodgingsDto> {
  const { session, ...rest } = await loadSession(db, sessionId)
  return { editable: isSessionEditable(session.status), ...rest }
}

/** Places a titolare of the session in a lodging, or takes it out (lodgingId null). */
export async function assignLodging(
  db: DbOrTx,
  input: { sessionId: string; participationId: string; lodgingId: string | null; actor: Actor },
): Promise<void> {
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'gli alloggi non si cambiano più')
  const [row] = await db
    .select({ id: sessionFamilies.id, lodgingId: sessionFamilies.lodgingId })
    .from(sessionFamilies)
    .where(and(eq(sessionFamilies.id, input.participationId), holdingPlace(session.id)))
  if (!row) throw new DomainError(404, 'La famiglia non ha un posto in questa sessione')
  if (row.lodgingId === input.lodgingId) return
  if (input.lodgingId) {
    const [lodging] = await db.select(columns).from(lodgings).where(eq(lodgings.id, input.lodgingId))
    if (!lodging) throw notFound()
    const [holder] = await db
      .select({ familyName: families.name })
      .from(sessionFamilies)
      .innerJoin(families, eq(families.id, sessionFamilies.familyId))
      .where(
        and(
          eq(sessionFamilies.sessionId, session.id),
          eq(sessionFamilies.lodgingId, lodging.id),
          ne(sessionFamilies.id, row.id),
        ),
      )
    if (holder) throw new DomainError(409, `«${lodging.name}» è già assegnato a ${holder.familyName}`)
    const [staff] = await db
      .select({ total: count() })
      .from(sessionStaff)
      .where(and(eq(sessionStaff.sessionId, session.id), eq(sessionStaff.lodgingId, lodging.id)))
    if (staff?.total) throw new DomainError(409, `In «${lodging.name}» dorme già lo staff`)
  }
  await db.update(sessionFamilies).set({ lodgingId: input.lodgingId }).where(eq(sessionFamilies.id, row.id))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'participation.lodging',
    entityType: 'session_family',
    entityId: row.id,
    data: { sessionId: session.id, from: row.lodgingId, to: input.lodgingId },
    ip: input.actor.ip,
  })
}

/**
 * Places a member of the session staff or v-team in a lodging, or takes them out (lodgingId null). A lodging
 * takes several of them, never with a family; more people than beds is a warning, not a refusal.
 */
export async function assignStaffLodging(
  db: DbOrTx,
  input: { sessionId: string; convocationId: string; lodgingId: string | null; actor: Actor },
): Promise<void> {
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'gli alloggi non si cambiano più')
  const [row] = await db
    .select({ id: sessionStaff.id, lodgingId: sessionStaff.lodgingId })
    .from(sessionStaff)
    .innerJoin(users, eq(users.id, sessionStaff.userId))
    .where(and(eq(sessionStaff.id, input.convocationId), activeStaff(session.id)))
  if (!row) throw new DomainError(404, 'Questa persona non è nello staff della sessione')
  if (row.lodgingId === input.lodgingId) return
  if (input.lodgingId) {
    const [lodging] = await db.select(columns).from(lodgings).where(eq(lodgings.id, input.lodgingId))
    if (!lodging) throw notFound()
    const [holder] = await db
      .select({ familyName: families.name })
      .from(sessionFamilies)
      .innerJoin(families, eq(families.id, sessionFamilies.familyId))
      .where(and(eq(sessionFamilies.sessionId, session.id), eq(sessionFamilies.lodgingId, lodging.id)))
    if (holder) throw new DomainError(409, `«${lodging.name}» è già assegnato a ${holder.familyName}`)
  }
  await db.update(sessionStaff).set({ lodgingId: input.lodgingId }).where(eq(sessionStaff.id, row.id))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'convocation.lodging',
    entityType: 'session_staff',
    entityId: row.id,
    data: { sessionId: session.id, from: row.lodgingId, to: input.lodgingId },
    ip: input.actor.ip,
  })
}

/**
 * The layout of the session as CSV: every lodging with the family or the staff placed in it, then the
 * families and the staff still without one. Needs come from "Esigenze per l'alloggio", never from the health details.
 */
export async function lodgingsCsv(db: DbOrTx, sessionId: string): Promise<{ filename: string; csv: string }> {
  const { session, lodgings: layout, families: placed, staff } = await loadSession(db, sessionId)
  /** Family, people, needs, what to check. */
  const familyCells = (family: SessionLodgingFamily, warnings: string[]) => [
    family.familyName,
    family.people || null,
    featureLabels(family.needs),
    [family.people ? null : NO_CARDS, ...warnings].filter(Boolean).join('. ') || null,
  ]
  /** The staff members, «Anna Rossi (V-team)», how many, no needs, what to check. */
  const staffCells = (people: SessionLodgingStaff[], warnings: string[]) => [
    people.map(person => `${person.name} (${enumLabel('staffTeam', person.team)})`).join(', '),
    people.length,
    null,
    warnings.join('. ') || null,
  ]
  return sessionCsv(session, 'alloggi', [
    ['Zona', 'Alloggio', 'Posti letto', 'Dotazioni', 'Chi ci dorme', 'Persone', 'Esigenze', 'Da controllare'],
    ...placeFamilies(layout, placed, staff).map(lodging => [
      lodging.area,
      lodging.name,
      lodging.beds,
      featureLabels(lodging.features),
      ...(lodging.family
        ? familyCells(lodging.family, lodging.warnings)
        : lodging.staff.length
          ? staffCells(lodging.staff, lodging.warnings)
          : [null, null, null, null]),
    ]),
    ...placed
      .filter(family => !family.lodgingId)
      .map(family => [null, null, null, null, ...familyCells(family, ['Senza alloggio'])]),
    ...staff
      .filter(person => !person.lodgingId)
      .map(person => [null, null, null, null, ...staffCells([person], ['Senza alloggio'])]),
  ])
}
