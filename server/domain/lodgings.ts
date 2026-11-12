// The lodgings of the camp and where each family sleeps in a session (docs/spec.md 3.11). The layout
// (lodgings) is entered once and used by every session; a titolare holding a place gets one lodging, a
// lodging hosts one family per session (session_families.lodgingId, with its unique index and check).
// Explicit imports only, so the database tests can load this file (tests/db/lodgings.test.ts).
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm'
import type { LodgingValues } from '../../shared/schemas/lodgings'
import type { FormAnswers } from '../../shared/types/domain'
import type { LodgingListItem, SessionLodgingFamily, SessionLodgingsDto } from '../../shared/types/lodgings'
import { NO_CARDS, accommodationNeeds, featureLabels, placeFamilies, sortLodgings } from '../../shared/utils/lodgings'
import { isSessionEditable } from '../../shared/utils/session-status'
import { ACTIVE_STATUSES } from '../../shared/utils/slots'
import { campSessions, families, lodgings, sessionFamilies } from '../db/schema'
import { writeAudit } from './audit'
import { sessionCsv } from './csv'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import { memberCountSql } from './families'
import { findSession, lockSession, requireEditable, type Actor } from './sessions'

const columns = {
  id: lodgings.id,
  name: lodgings.name,
  area: lodgings.area,
  beds: lodgings.beds,
  features: lodgings.features,
  description: lodgings.description,
}

const notFound = () => new DomainError(404, 'Alloggio non trovato')

/** The participations of the session that hold a place: titolari not declined nor removed. */
const holdingPlace = (sessionId: string) =>
  and(
    eq(sessionFamilies.sessionId, sessionId),
    eq(sessionFamilies.kind, 'slot'),
    inArray(sessionFamilies.status, [...ACTIVE_STATUSES]),
  )

// ─── The layout ────────────────────────────────────────────────────────────────────────────────────

/** Every lodging, in the order of the layout, with how many sessions place a family in it. */
export async function listLodgings(db: DbOrTx): Promise<LodgingListItem[]> {
  const rows = await db
    .select({ ...columns, sessions: count(sessionFamilies.id) })
    .from(lodgings)
    .leftJoin(sessionFamilies, eq(sessionFamilies.lodgingId, lodgings.id))
    .groupBy(lodgings.id)
  return sortLodgings(rows)
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
  const placed = await db
    .select({ id: sessionFamilies.id, sessionId: sessionFamilies.sessionId, status: campSessions.status })
    .from(sessionFamilies)
    .innerJoin(campSessions, eq(campSessions.id, sessionFamilies.sessionId))
    .where(eq(sessionFamilies.lodgingId, id))
  const closed = placed.filter(row => !isSessionEditable(row.status)).length
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
    data: { name: lodging.name, freed: placed.map(row => ({ participationId: row.id, sessionId: row.sessionId })) },
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

/** The session, its layout and its families, read together. */
async function loadSession(db: DbOrTx, sessionId: string) {
  const [session, layout, placed] = await Promise.all([
    findSession(db, sessionId),
    db.select(columns).from(lodgings),
    lodgingFamilies(db, sessionId),
  ])
  return { session, lodgings: sortLodgings(layout), families: placed }
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
 * The layout of the session as CSV: every lodging with the family placed in it, then the families
 * still without one. Needs come from "Esigenze per l'alloggio", never from the health details.
 */
export async function lodgingsCsv(db: DbOrTx, sessionId: string): Promise<{ filename: string; csv: string }> {
  const { session, lodgings: layout, families: placed } = await loadSession(db, sessionId)
  /** Family, people, needs, what to check. */
  const familyCells = (family: SessionLodgingFamily, warnings: string[]) => [
    family.familyName,
    family.people || null,
    featureLabels(family.needs),
    [family.people ? null : NO_CARDS, ...warnings].filter(Boolean).join('. ') || null,
  ]
  return sessionCsv(session, 'alloggi', [
    ['Zona', 'Alloggio', 'Posti letto', 'Dotazioni', 'Famiglia', 'Persone', 'Esigenze', 'Da controllare'],
    ...placeFamilies(layout, placed).map(lodging => [
      lodging.area,
      lodging.name,
      lodging.beds,
      featureLabels(lodging.features),
      ...(lodging.family ? familyCells(lodging.family, lodging.warnings) : [null, null, null, null]),
    ]),
    ...placed
      .filter(family => !family.lodgingId)
      .map(family => [null, null, null, null, ...familyCells(family, ['Senza alloggio'])]),
  ])
}
