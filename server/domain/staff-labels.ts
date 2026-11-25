// The roles of staff and v-team and the tags of the «Valutazione» (docs/spec.md 3.4): lists the
// administration creates, renames and deletes from /admin/staff, and gives to people. Profiles keep the ids
// in `staff_profiles.roles` and `staff_profiles.tags`; deleting one takes it away from everyone. Explicit
// imports only, so the database tests load this module directly.
import { asc, count, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { StaffRoleInput, StaffTagInput } from '../../shared/schemas/staff'
import type { StaffLabels } from '../../shared/types/staff'
import { PROTECTED_ROLES } from '../../shared/utils/constants'
import { sessionStaff, staffProfiles, staffRoles, staffTags } from '../db/schema'
import { writeAudit } from './audit'
import { isUniqueViolation, type DbOrTx } from './db'
import { httpError, type Actor } from './users'

const KINDS = {
  role: {
    table: staffRoles,
    field: 'roles',
    noun: 'ruolo',
    notFound: 'Ruolo non trovato',
    missing: 'Un ruolo scelto non esiste più',
  },
  tag: {
    table: staffTags,
    field: 'tags',
    noun: 'tag',
    notFound: 'Tag non trovato',
    missing: 'Un tag scelto non esiste più',
  },
} as const
type Kind = keyof typeof KINDS

/** Profiles whose list (roles or tags) holds `id`. */
const holds = (kind: Kind, id: string) => sql`${staffProfiles[KINDS[kind].field]} @> jsonb_build_array(${id}::text)`

/** The roles in their order: the choices of the application and of the admin pages. */
export function staffRoleOptions(db: DbOrTx) {
  return db
    .select({ id: staffRoles.id, name: staffRoles.name })
    .from(staffRoles)
    .orderBy(asc(staffRoles.position), asc(staffRoles.name))
}

/** Both lists in their order, with how many people (and, for roles, convocations) have each. */
export async function staffLabels(db: DbOrTx): Promise<StaffLabels> {
  const [roles, tags, profiles, convocations] = await Promise.all([
    staffRoleOptions(db),
    db
      .select({ id: staffTags.id, name: staffTags.name, color: staffTags.color })
      .from(staffTags)
      .orderBy(asc(staffTags.position), asc(staffTags.name)),
    // A camp has tens of staff, not thousands: counting here is simpler than unnesting the lists in SQL.
    db.select({ roles: staffProfiles.roles, tags: staffProfiles.tags }).from(staffProfiles),
    db
      .select({ role: sessionStaff.role, count: count() })
      .from(sessionStaff)
      .where(isNotNull(sessionStaff.role))
      .groupBy(sessionStaff.role),
  ])
  const people = (field: 'roles' | 'tags', id: string) => profiles.filter(profile => profile[field].includes(id)).length
  const convoked = new Map(convocations.map(row => [row.role, row.count]))
  return {
    roles: roles.map(role => ({ ...role, people: people('roles', role.id), convocations: convoked.get(role.id) ?? 0 })),
    tags: tags.map(tag => ({ ...tag, people: people('tags', tag.id) })),
  }
}

/**
 * The ids without repeats, all existing: one deleted meanwhile is refused (409). The rows stay locked
 * until the commit, so a delete running at the same time waits and then strips what was saved.
 */
export async function checkLabels(db: DbOrTx, kind: Kind, ids: readonly string[]): Promise<string[]> {
  const unique = [...new Set(ids)]
  if (!unique.length) return unique
  const { table, missing } = KINDS[kind]
  const found = await db.select({ id: table.id }).from(table).where(inArray(table.id, unique)).for('share')
  if (found.length !== unique.length) throw httpError(409, missing)
  return unique
}

/** A name is unique whatever the case (the index on lower(name)): the same name twice is a 409. */
async function writeName<T>(kind: Kind, write: Promise<T>): Promise<T> {
  try {
    return await write
  } catch (error) {
    throw isUniqueViolation(error) ? httpError(409, `C’è già un ${KINDS[kind].noun} con questo nome`) : error
  }
}

async function nextPosition(db: DbOrTx, kind: Kind): Promise<number> {
  const { table } = KINDS[kind]
  const [row] = await db.select({ last: sql<number | null>`max(${table.position})` }).from(table)
  return (row?.last ?? -1) + 1
}

export async function createStaffRole(db: DbOrTx, input: StaffRoleInput, actor: Actor): Promise<string> {
  const position = await nextPosition(db, 'role')
  const [row] = await writeName(
    'role',
    db.insert(staffRoles).values({ name: input.name, position }).returning({ id: staffRoles.id }),
  )
  await audit(db, 'role', 'create', row!.id, { name: input.name }, actor)
  return row!.id
}

export async function renameStaffRole(db: DbOrTx, id: string, input: StaffRoleInput, actor: Actor): Promise<void> {
  const [before] = await db.select({ name: staffRoles.name }).from(staffRoles).where(eq(staffRoles.id, id))
  if (!before) throw httpError(404, KINDS.role.notFound)
  if (before.name === input.name) return
  await writeName('role', db.update(staffRoles).set({ name: input.name }).where(eq(staffRoles.id, id)))
  await audit(db, 'role', 'update', id, { from: before.name, to: input.name }, actor)
}

export async function createStaffTag(db: DbOrTx, input: StaffTagInput, actor: Actor): Promise<string> {
  const position = await nextPosition(db, 'tag')
  const [row] = await writeName(
    'tag',
    db
      .insert(staffTags)
      .values({ ...input, position })
      .returning({ id: staffTags.id }),
  )
  await audit(db, 'tag', 'create', row!.id, { ...input }, actor)
  return row!.id
}

export async function updateStaffTag(db: DbOrTx, id: string, input: StaffTagInput, actor: Actor): Promise<void> {
  const [before] = await db
    .select({ name: staffTags.name, color: staffTags.color })
    .from(staffTags)
    .where(eq(staffTags.id, id))
  if (!before) throw httpError(404, KINDS.tag.notFound)
  if (before.name === input.name && before.color === input.color) return
  await writeName('tag', db.update(staffTags).set(input).where(eq(staffTags.id, id)))
  await audit(db, 'tag', 'update', id, { from: before, to: input }, actor)
}

/**
 * Deletes a role or a tag and takes it away from every profile; a convocation with the role keeps no role
 * (the foreign key), also in sessions already over: the audit keeps which ones had it. The roles the app
 * knows (PROTECTED_ROLES) stay.
 */
export async function deleteStaffLabel(db: DbOrTx, kind: Kind, id: string, actor: Actor): Promise<void> {
  const reason = kind === 'role' ? PROTECTED_ROLES.get(id) : undefined
  if (reason) throw httpError(409, `${reason}: puoi rinominarlo, non eliminarlo`)
  const { table, field, notFound } = KINDS[kind]
  const convocations =
    kind === 'role'
      ? (await db.select({ id: sessionStaff.id }).from(sessionStaff).where(eq(sessionStaff.role, id))).map(
          row => row.id,
        )
      : []
  const [row] = await db.delete(table).where(eq(table.id, id)).returning({ name: table.name })
  if (!row) throw httpError(404, notFound)
  const stripped = await db
    .update(staffProfiles)
    .set({ [field]: sql`${staffProfiles[field]} - ${id}::text` })
    .where(holds(kind, id))
    .returning({ id: staffProfiles.id })
  const data = { name: row.name, people: stripped.length, ...(kind === 'role' ? { convocations } : {}) }
  await audit(db, kind, 'delete', id, data, actor)
}

/** Tags have uuid ids, as `audit_log.entity_id`; the roles' are text (`coordinator`), so theirs goes in the data. */
function audit(
  db: DbOrTx,
  kind: Kind,
  change: 'create' | 'update' | 'delete',
  id: string,
  data: Record<string, unknown>,
  actor: Actor,
) {
  return writeAudit(db, {
    actorUserId: actor.userId,
    action: `staff_${kind}.${change}`,
    entityType: `staff_${kind}`,
    entityId: kind === 'tag' ? id : null,
    data: kind === 'tag' ? data : { id, ...data },
    ip: actor.ip ?? null,
  })
}
