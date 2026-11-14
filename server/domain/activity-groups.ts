// The activity groups of a session (docs/spec.md 3.12): the titolari holding a place split among the groups
// of the programme (Giallo, Rosso, Blu), each led by a person of the session staff. A family is in one group
// (session_families.activityGroup), a group has one leader (session_staff.activityGroup, unique per session).
// Explicit imports only, so the database tests can load this file (tests/db/activity-groups.test.ts).
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { SessionGroupFamily, SessionGroupStaff, SessionGroupsDto } from '../../shared/types/activity-groups'
import { distributeFamilies } from '../../shared/utils/activity-groups'
import { PROGRAMME_GROUPS, PROGRAMME_GROUP_LABELS, type ProgrammeGroup } from '../../shared/utils/constants'
import { ageOn } from '../../shared/utils/dates'
import { NO_CARDS, fullName, memberName } from '../../shared/utils/format'
import { isSessionEditable } from '../../shared/utils/session-status'
import { familyMembers, families, sessionFamilies, sessionStaff, users } from '../db/schema'
import { writeAudit } from './audit'
import { sessionCsv } from './csv'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import {
  activeStaff,
  findSession,
  requireActiveConvocation,
  holdingPlace,
  lockSession,
  requireEditable,
  type Actor,
} from './sessions'

/**
 * The titolari holding a place, by name, each with its cards: the young first, with their age at the start
 * of the session. A card still to fill in is named as in the family pages ("Adulto 2").
 */
async function groupFamilies(db: DbOrTx, session: { id: string; startDate: string }): Promise<SessionGroupFamily[]> {
  const rows = await db
    .select({
      id: sessionFamilies.id,
      familyId: sessionFamilies.familyId,
      familyName: families.name,
      status: sessionFamilies.status,
      group: sessionFamilies.activityGroup,
    })
    .from(sessionFamilies)
    .innerJoin(families, eq(families.id, sessionFamilies.familyId))
    .where(holdingPlace(session.id))
  const cards = rows.length
    ? await db
        .select({
          id: familyMembers.id,
          familyId: familyMembers.familyId,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
          kind: familyMembers.kind,
          birthDate: familyMembers.birthDate,
        })
        .from(familyMembers)
        .where(
          inArray(
            familyMembers.familyId,
            rows.map(row => row.familyId),
          ),
        )
        .orderBy(asc(familyMembers.position), asc(familyMembers.createdAt))
    : []
  const byFamily = Map.groupBy(cards, card => card.familyId)
  /** Years at the start of the session; null for adults, and for a card born after it. */
  const ageOf = (card: (typeof cards)[number]) => {
    const age = card.kind === 'young' && card.birthDate ? ageOn(card.birthDate, session.startDate) : -1
    return age < 0 ? null : age
  }
  return rows
    .sort((a, b) => a.familyName.localeCompare(b.familyName, 'it'))
    .map(row => {
      const own = byFamily.get(row.familyId) ?? []
      return {
        ...row,
        members: [...own.filter(card => card.kind === 'young'), ...own.filter(card => card.kind !== 'young')].map(
          card => ({ name: card.firstName ?? memberName(card, own), age: ageOf(card) }),
        ),
      }
    })
}

/** The session staff who can lead a group (activeStaff): group leads first. */
async function groupStaff(db: DbOrTx, sessionId: string): Promise<SessionGroupStaff[]> {
  const rows = await db
    .select({
      id: sessionStaff.id,
      firstName: users.firstName,
      lastName: users.lastName,
      role: sessionStaff.role,
      status: sessionStaff.status,
      group: sessionStaff.activityGroup,
    })
    .from(sessionStaff)
    .innerJoin(users, eq(users.id, sessionStaff.userId))
    .where(activeStaff(sessionId))
  const lead = (person: { role: SessionGroupStaff['role'] }) => Number(person.role === 'group_lead')
  return rows
    .map(({ firstName, lastName, ...row }) => ({ ...row, name: fullName({ firstName, lastName }) }))
    .sort((a, b) => lead(b) - lead(a) || a.name.localeCompare(b.name, 'it'))
}

async function loadSession(db: DbOrTx, sessionId: string) {
  const session = await findSession(db, sessionId)
  const [groupedFamilies, staff] = await Promise.all([groupFamilies(db, session), groupStaff(db, session.id)])
  return { session, families: groupedFamilies, staff }
}

/** GET /api/admin/sessions/:id/groups: the families holding a place, their groups and who can lead them. */
export async function sessionGroupsOf(db: DbOrTx, sessionId: string): Promise<SessionGroupsDto> {
  const { session, ...rest } = await loadSession(db, sessionId)
  return { editable: isSessionEditable(session.status), ...rest }
}

/** The session, locked, while its groups can still change. */
async function lockGroups(db: DbOrTx, sessionId: string) {
  const session = await lockSession(db, sessionId)
  requireEditable(session, 'i gruppi non si cambiano più')
  return session
}

/** Puts a titolare of the session in a group, or takes it out (group null). */
export async function assignGroup(
  db: DbOrTx,
  input: { sessionId: string; participationId: string; group: ProgrammeGroup | null; actor: Actor },
): Promise<void> {
  const session = await lockGroups(db, input.sessionId)
  const [row] = await db
    .select({ id: sessionFamilies.id, group: sessionFamilies.activityGroup })
    .from(sessionFamilies)
    .where(and(eq(sessionFamilies.id, input.participationId), holdingPlace(session.id)))
  if (!row) throw new DomainError(404, 'La famiglia non ha un posto in questa sessione')
  if (row.group === input.group) return
  await db.update(sessionFamilies).set({ activityGroup: input.group }).where(eq(sessionFamilies.id, row.id))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'participation.activity_group',
    entityType: 'session_family',
    entityId: row.id,
    data: { sessionId: session.id, from: row.group, to: input.group },
    ip: input.actor.ip,
  })
}

/**
 * Gives a group its leader, a person of the session staff, or leaves it without one (convocationId null).
 * A person leads one group: choosing who leads another one moves them, and that group is left without.
 */
export async function setGroupLeader(
  db: DbOrTx,
  input: { sessionId: string; group: ProgrammeGroup; convocationId: string | null; actor: Actor },
): Promise<void> {
  const session = await lockGroups(db, input.sessionId)
  const [current] = await db
    .select({ id: sessionStaff.id })
    .from(sessionStaff)
    .where(and(eq(sessionStaff.sessionId, session.id), eq(sessionStaff.activityGroup, input.group)))
    .for('update')
  if ((current?.id ?? null) === input.convocationId) return
  // Locked, so that the person cannot decline or be withdrawn before they lead the group.
  const leader = input.convocationId ? await requireActiveConvocation(db, session.id, input.convocationId) : undefined
  // The unique index allows one leader per group: the current one steps down first.
  if (current) await db.update(sessionStaff).set({ activityGroup: null }).where(eq(sessionStaff.id, current.id))
  if (leader) await db.update(sessionStaff).set({ activityGroup: input.group }).where(eq(sessionStaff.id, leader.id))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'session.group_leader',
    entityType: 'session',
    entityId: session.id,
    // `left`: the group the new leader led until now, left without a leader.
    data: { group: input.group, from: current?.id ?? null, to: input.convocationId, left: leader?.group ?? null },
    ip: input.actor.ip,
  })
}

/** Puts every family without a group into one, keeping the groups even (distributeFamilies). */
export async function distributeGroups(db: DbOrTx, input: { sessionId: string; actor: Actor }): Promise<number> {
  const session = await lockGroups(db, input.sessionId)
  const placed = distributeFamilies(await groupFamilies(db, session))
  if (!placed.size) return 0
  for (const [group, entries] of Map.groupBy(placed, ([, to]) => to)) {
    await db
      .update(sessionFamilies)
      .set({ activityGroup: group })
      .where(
        inArray(
          sessionFamilies.id,
          entries.map(([id]) => id),
        ),
      )
  }
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'session.groups_distribute',
    entityType: 'session',
    entityId: session.id,
    data: { placed: Object.fromEntries(placed) },
    ip: input.actor.ip,
  })
  return placed.size
}

/**
 * The groups of the session as CSV, one row per person: group by group with its leader, then the families
 * still without a group. Names and the age of the young, never the health details.
 */
export async function groupsCsv(db: DbOrTx, sessionId: string): Promise<{ filename: string; csv: string }> {
  const { session, families: grouped, staff } = await loadSession(db, sessionId)
  const rowsOf = (group: ProgrammeGroup | null) => {
    const label = group ? PROGRAMME_GROUP_LABELS[group] : 'Senza gruppo'
    const leader = (group && staff.find(person => person.group === group)?.name) || null
    return grouped
      .filter(family => family.group === group)
      .flatMap(family =>
        (family.members.length ? family.members : [null]).map(member => [
          label,
          leader,
          family.familyName,
          member?.name ?? NO_CARDS,
          member?.age ?? null,
        ]),
      )
  }
  return sessionCsv(session, 'gruppi', [
    ['Gruppo', 'Responsabile', 'Famiglia', 'Componente', 'Età'],
    ...PROGRAMME_GROUPS.flatMap(rowsOf),
    ...rowsOf(null),
  ])
}
