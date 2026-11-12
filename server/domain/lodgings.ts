// The lodgings of the camp and where each family sleeps in a session (docs/spec.md 3.11). The layout
// (lodgings) is entered once and used by every session; a family holding a place gets one lodging,
// a lodging hosts one family per session (session_families.lodgingId).
// Explicit imports only, so the database tests can load this file (tests/db/lodgings.test.ts).
import { and, count, eq, ne, sql } from 'drizzle-orm'
import type { LodgingValues } from '../../shared/schemas/lodgings'
import type { LodgingListItem, SessionLodgingFamily, SessionLodgingsDto } from '../../shared/types/lodgings'
import { enumLabel, type LodgingFeature } from '../../shared/utils/constants'
import { accommodationNeeds, lodgingWarnings, sortLodgings } from '../../shared/utils/lodgings'
import { isSessionEditable } from '../../shared/utils/session-status'
import { holdsSlot } from '../../shared/utils/slots'
import { campSessions, families, familyMembers, lodgings, sessionFamilies } from '../db/schema'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import { lockSession, requireEditable, sessionCsv, type Actor } from './sessions'

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

export async function updateLodging(db: DbOrTx, id: string, input: LodgingValues): Promise<void> {
  const [row] = await db.update(lodgings).set(input).where(eq(lodgings.id, id)).returning({ id: lodgings.id })
  if (!row) throw notFound()
}

/** Deletes a lodging: the families placed in it, in any session, are left without one. */
export async function deleteLodging(db: DbOrTx, id: string): Promise<void> {
  const [row] = await db.delete(lodgings).where(eq(lodgings.id, id)).returning({ id: lodgings.id })
  if (!row) throw notFound()
}

// ─── A session ─────────────────────────────────────────────────────────────────────────────────────

async function sessionRow(db: DbOrTx, sessionId: string) {
  const [session] = await db.select().from(campSessions).where(eq(campSessions.id, sessionId)).limit(1)
  if (!session) throw new DomainError(404, 'Sessione non trovata')
  return session
}

/** The families holding a place in the session, by name, with their size and needs. */
async function lodgingFamilies(db: DbOrTx, sessionId: string): Promise<SessionLodgingFamily[]> {
  const rows = await db
    .select({
      id: sessionFamilies.id,
      familyId: sessionFamilies.familyId,
      familyName: families.name,
      kind: sessionFamilies.kind,
      status: sessionFamilies.status,
      reserveRank: sessionFamilies.reserveRank,
      formAnswers: families.formAnswers,
      people:
        sql<number>`(select count(*) from ${familyMembers} where ${familyMembers.familyId} = ${families.id})`.mapWith(
          Number,
        ),
      lodgingId: sessionFamilies.lodgingId,
    })
    .from(sessionFamilies)
    .innerJoin(families, eq(families.id, sessionFamilies.familyId))
    .where(eq(sessionFamilies.sessionId, sessionId))
  return rows
    .filter(holdsSlot)
    .sort((a, b) => a.familyName.localeCompare(b.familyName, 'it'))
    .map(row => ({
      id: row.id,
      familyId: row.familyId,
      familyName: row.familyName,
      status: row.status,
      people: row.people,
      needs: accommodationNeeds(row.formAnswers),
      lodgingId: row.lodgingId,
    }))
}

/** GET /api/admin/sessions/:id/lodgings: the layout and the families to place in it. */
export async function sessionLodgingsOf(db: DbOrTx, sessionId: string): Promise<SessionLodgingsDto> {
  const session = await sessionRow(db, sessionId)
  return {
    sessionId,
    editable: isSessionEditable(session.status),
    lodgings: sortLodgings(await db.select(columns).from(lodgings)),
    families: await lodgingFamilies(db, sessionId),
  }
}

/** Places a family of the session in a lodging, or takes it out (lodgingId null). */
export async function assignLodging(
  db: DbOrTx,
  input: { sessionId: string; participationId: string; lodgingId: string | null; actor: Actor },
): Promise<void> {
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'gli alloggi non si cambiano più')
  const [row] = await db
    .select({
      id: sessionFamilies.id,
      kind: sessionFamilies.kind,
      status: sessionFamilies.status,
      reserveRank: sessionFamilies.reserveRank,
      lodgingId: sessionFamilies.lodgingId,
    })
    .from(sessionFamilies)
    .where(and(eq(sessionFamilies.id, input.participationId), eq(sessionFamilies.sessionId, session.id)))
  if (!row || !holdsSlot(row)) throw new DomainError(404, 'La famiglia non ha un posto in questa sessione')
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
  if (row.lodgingId === input.lodgingId) return
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
  const session = await sessionRow(db, sessionId)
  const { lodgings: layout, families: placed } = await sessionLodgingsOf(db, sessionId)
  const labels = (features: readonly LodgingFeature[]) =>
    features.map(feature => enumLabel('lodgingFeature', feature)).join(', ')
  const familyCells = (family: SessionLodgingFamily | undefined) =>
    family ? [family.familyName, family.people, labels(family.needs)] : [null, null, null]
  const byLodging = new Map(placed.flatMap(family => (family.lodgingId ? [[family.lodgingId, family] as const] : [])))
  const header = ['Zona', 'Alloggio', 'Posti letto', 'Dotazioni', 'Famiglia', 'Persone', 'Esigenze', 'Da controllare']
  const rows = [
    ...layout.map(lodging => {
      const family = byLodging.get(lodging.id)
      return [
        lodging.area,
        lodging.name,
        lodging.beds,
        labels(lodging.features),
        ...familyCells(family),
        family ? lodgingWarnings(family, lodging).join('. ') : null,
      ]
    }),
    ...placed
      .filter(family => !family.lodgingId)
      .map(family => [null, null, null, null, ...familyCells(family), 'Senza alloggio']),
  ]
  return sessionCsv(session, 'alloggi', header, rows)
}
