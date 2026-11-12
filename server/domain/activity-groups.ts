// The activity groups of a session (docs/spec.md 3.12): the titolari holding a place split among the groups
// of the programme (Giallo, Rosso, Blu), each led by a person of the session staff. A family is in one group
// (session_families.activityGroup), a group has one leader (session_staff.activityGroup, unique per session).
// Explicit imports only, so the database tests can load this file (tests/db/activity-groups.test.ts).
import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import type { SessionGroupFamily, SessionGroupStaff, SessionGroupsDto } from '../../shared/types/activity-groups'
import { distributeFamilies } from '../../shared/utils/activity-groups'
import {
  OPEN_CONVOCATIONS,
  PROGRAMME_GROUPS,
  PROGRAMME_GROUP_LABELS,
  type ProgrammeGroup,
} from '../../shared/utils/constants'
import { ageOn } from '../../shared/utils/dates'
import { fullName, memberName } from '../../shared/utils/format'
import { NO_CARDS } from '../../shared/utils/lodgings'
import { isSessionEditable } from '../../shared/utils/session-status'
import { familyMembers, families, sessionFamilies, sessionStaff, users } from '../db/schema'
import { writeAudit } from './audit'
import { sessionCsv } from './csv'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import { findSession, holdingPlace, lockSession, requireEditable, type Actor } from './sessions'

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

/** Who can lead a group of the session: a convocation not declined nor withdrawn, an account not disabled. */
const canLead = (sessionId: string) =>
  and(
    eq(sessionStaff.sessionId, sessionId),
    inArray(sessionStaff.status, [...OPEN_CONVOCATIONS]),
    ne(users.status, 'disabled'),
  )

/** The session staff who can lead a group (canLead): group leads first. */
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
    .where(canLead(sessionId))
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

/** Puts a titolare of the session in a group, or takes it out (group null). */
export async function assignGroup(
  db: DbOrTx,
  input: { sessionId: string; participationId: string; group: ProgrammeGroup | null; actor: Actor },
): Promise<void> {
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'i gruppi non si cambiano più')
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
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'i gruppi non si cambiano più')
  const [current] = await db
    .select({ id: sessionStaff.id })
    .from(sessionStaff)
    .where(and(eq(sessionStaff.sessionId, session.id), eq(sessionStaff.activityGroup, input.group)))
    .for('update')
  if ((current?.id ?? null) === input.convocationId) return
  let leader: { id: string; group: ProgrammeGroup | null } | undefined
  if (input.convocationId) {
    // Locked, so that the person cannot decline or be withdrawn before they lead the group.
    ;[leader] = await db
      .select({ id: sessionStaff.id, group: sessionStaff.activityGroup })
      .from(sessionStaff)
      .innerJoin(users, eq(users.id, sessionStaff.userId))
      .where(and(eq(sessionStaff.id, input.convocationId), canLead(session.id)))
      .for('update', { of: sessionStaff })
    if (!leader) throw new DomainError(404, 'Questa persona non è nello staff della sessione')
  }
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
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'i gruppi non si cambiano più')
  const placed = distributeFamilies(await groupFamilies(db, session))
  if (!placed.size) return 0
  for (const group of PROGRAMME_GROUPS) {
    const ids = [...placed].filter(([, to]) => to === group).map(([id]) => id)
    if (ids.length)
      await db.update(sessionFamilies).set({ activityGroup: group }).where(inArray(sessionFamilies.id, ids))
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
  const leaders = new Map(staff.flatMap(person => (person.group ? [[person.group, person.name] as const] : [])))
  const rowsOf = (group: ProgrammeGroup | null) =>
    grouped
      .filter(family => family.group === group)
      .flatMap(family =>
        (family.members.length ? family.members : [null]).map(member => [
          group ? PROGRAMME_GROUP_LABELS[group] : 'Senza gruppo',
          group ? (leaders.get(group) ?? null) : null,
          family.familyName,
          member?.name ?? NO_CARDS,
          member?.age ?? null,
        ]),
      )
  return sessionCsv(session, 'gruppi', [
    ['Gruppo', 'Responsabile', 'Famiglia', 'Componente', 'Età'],
    ...PROGRAMME_GROUPS.flatMap(rowsOf),
    ...rowsOf(null),
  ])
}
