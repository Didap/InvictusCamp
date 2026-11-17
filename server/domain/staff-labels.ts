// The roles of staff and v-team and the tags of the «Valutazione» (docs/spec.md 3.4): lists the
// administration creates, renames and deletes from /admin/staff, and gives to people. Profiles keep the ids
// in `staff_profiles.roles` and `staff_profiles.tags`; deleting one takes it away from everyone. Explicit
// imports only, so the database tests load this module directly.
import { asc, count, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { StaffRoleInput, StaffTagInput } from '../../shared/schemas/staff'
import type { StaffLabels } from '../../shared/types/staff'
import { COORDINATOR_ROLE } from '../../shared/utils/constants'
import { sessionStaff, staffProfiles, staffRoles, staffTags } from '../db/schema'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { httpError, type Actor } from './users'

const KINDS = {
  role: { table: staffRoles, column: staffProfiles.roles, noun: 'ruolo', notFound: 'Ruolo non trovato' },
  tag: { table: staffTags, column: staffProfiles.tags, noun: 'tag', notFound: 'Tag non trovato' },
} as const
type Kind = keyof typeof KINDS

/** Profiles whose list (roles or tags) holds `id`. */
const holds = (kind: Kind, id: string) => sql`${KINDS[kind].column} @> jsonb_build_array(${id}::text)`

/** Both lists in their order, with how many people (and, for roles, convocations) have each. */
export async function staffLabels(db: DbOrTx): Promise<StaffLabels> {
  const [roles, tags, profiles, convocations] = await Promise.all([
    db
      .select({ id: staffRoles.id, name: staffRoles.name })
      .from(staffRoles)
      .orderBy(asc(staffRoles.position), asc(staffRoles.name)),
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

/** The names of the roles, by id: for the emails and the pages that show a role. */
export async function roleNames(db: DbOrTx): Promise<Map<string, string>> {
  const rows = await db.select({ id: staffRoles.id, name: staffRoles.name }).from(staffRoles)
  return new Map(rows.map(row => [row.id, row.name]))
}

/** Every id exists: a role or a tag deleted meanwhile is refused, not saved. */
export async function checkLabels(db: DbOrTx, kind: Kind, ids: readonly string[]): Promise<string[]> {
  const unique = [...new Set(ids)]
  if (!unique.length) return unique
  const { table } = KINDS[kind]
  const found = await db.select({ id: table.id }).from(table).where(inArray(table.id, unique))
  if (found.length !== unique.length) {
    throw httpError(409, kind === 'role' ? 'Un ruolo scelto non esiste più' : 'Un tag scelto non esiste più')
  }
  return unique
}

async function nameTaken(db: DbOrTx, kind: Kind, name: string, except?: string): Promise<void> {
  const { table, noun } = KINDS[kind]
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(sql`lower(${table.name}) = lower(${name}) and ${table.id}::text <> ${except ?? ''}`)
  if (row) throw httpError(409, `C’è già un ${noun} con questo nome`)
}

async function nextPosition(db: DbOrTx, kind: Kind): Promise<number> {
  const { table } = KINDS[kind]
  const [row] = await db.select({ last: sql<number | null>`max(${table.position})` }).from(table)
  return (row?.last ?? -1) + 1
}

export async function createStaffRole(db: DbOrTx, input: StaffRoleInput, actor: Actor): Promise<string> {
  await nameTaken(db, 'role', input.name)
  const [row] = await db
    .insert(staffRoles)
    .values({ name: input.name, position: await nextPosition(db, 'role') })
    .returning({ id: staffRoles.id })
  await audit(db, 'staff_role.create', row!.id, { name: input.name }, actor)
  return row!.id
}

export async function renameStaffRole(db: DbOrTx, id: string, input: StaffRoleInput, actor: Actor): Promise<void> {
  await nameTaken(db, 'role', input.name, id)
  const [before] = await db.select({ name: staffRoles.name }).from(staffRoles).where(eq(staffRoles.id, id))
  if (!before) throw httpError(404, KINDS.role.notFound)
  if (before.name === input.name) return
  await db.update(staffRoles).set({ name: input.name }).where(eq(staffRoles.id, id))
  await audit(db, 'staff_role.update', id, { from: before.name, to: input.name }, actor)
}

export async function createStaffTag(db: DbOrTx, input: StaffTagInput, actor: Actor): Promise<string> {
  await nameTaken(db, 'tag', input.name)
  const [row] = await db
    .insert(staffTags)
    .values({ ...input, position: await nextPosition(db, 'tag') })
    .returning({ id: staffTags.id })
  await audit(db, 'staff_tag.create', row!.id, { ...input }, actor)
  return row!.id
}

export async function updateStaffTag(db: DbOrTx, id: string, input: StaffTagInput, actor: Actor): Promise<void> {
  await nameTaken(db, 'tag', input.name, id)
  const [before] = await db
    .select({ name: staffTags.name, color: staffTags.color })
    .from(staffTags)
    .where(eq(staffTags.id, id))
  if (!before) throw httpError(404, KINDS.tag.notFound)
  if (before.name === input.name && before.color === input.color) return
  await db.update(staffTags).set(input).where(eq(staffTags.id, id))
  await audit(db, 'staff_tag.update', id, { from: before, to: input }, actor)
}

/**
 * Deletes a role or a tag and takes it away from every profile; a convocation with the role keeps no role
 * (the foreign key). The coordinator stays: the base of a session counts it (spec 3.5).
 */
export async function deleteStaffLabel(db: DbOrTx, kind: Kind, id: string, actor: Actor): Promise<void> {
  if (kind === 'role' && id === COORDINATOR_ROLE) {
    throw httpError(409, 'Il ruolo del coordinatore serve alla base della sessione: puoi rinominarlo, non eliminarlo')
  }
  const { table, column, notFound } = KINDS[kind]
  const [row] = await db.delete(table).where(eq(table.id, id)).returning({ name: table.name })
  if (!row) throw httpError(404, notFound)
  const stripped = await db
    .update(staffProfiles)
    .set({ [kind === 'role' ? 'roles' : 'tags']: sql`${column} - ${id}::text` })
    .where(holds(kind, id))
    .returning({ id: staffProfiles.id })
  await audit(db, `staff_${kind}.delete`, id, { name: row.name, people: stripped.length }, actor)
}

/** The first roles have text ids (`coordinator`): `entity_id` is a uuid, so the id goes in the data. */
function audit(db: DbOrTx, action: string, id: string, data: Record<string, unknown>, actor: Actor) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  return writeAudit(db, {
    actorUserId: actor.userId,
    action,
    entityType: action.split('.')[0]!,
    entityId: uuid ? id : null,
    data: uuid ? data : { id, ...data },
    ip: actor.ip ?? null,
  })
}
