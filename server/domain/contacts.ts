// The «Anagrafica» (docs/spec.md 3.16): the people the camp keeps in touch with, with an account or without,
// their groups, the bulk import of a pasted list and the actions on many contacts at once. Every action is one
// statement on its selection, never one per contact: the production database is a network hop away. An import
// holds at most CONTACT_IMPORT_MAX rows, so its statements stay under the 65535 parameters of Postgres.
// Explicit imports only, so the database tests load this module directly.
import { and, asc, count, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import type {
  ContactBulkInput,
  ContactFilter,
  ContactGroupInput,
  ContactImportInput,
  ContactInput,
  ContactListQuery,
} from '../../shared/schemas/contacts'
import type { Paginated } from '../../shared/types/api'
import type { ContactGroupItem, ContactImportResult, ContactListItem } from '../../shared/types/contacts'
import { contactGroupMembers, contactGroups, contacts, users } from '../db/schema'
import { writeAudit } from './audit'
import { isUniqueViolation, type DbOrTx } from './db'
import { containsPattern, httpError, type Actor } from './users'

const duplicateContact = () => httpError(409, 'Questa email è già in anagrafica: cercala nell’elenco')
const duplicateGroup = () => httpError(409, 'Esiste già un gruppo con questo nome')

function audit(
  db: DbOrTx,
  action: string,
  entityType: string,
  entityId: string | null,
  data: Record<string, unknown>,
  actor: Actor,
) {
  return writeAudit(db, { actorUserId: actor.userId, action, entityType, entityId, data, ip: actor.ip })
}

/** Runs a write and turns a unique violation (an email or a group name taken) into a 409. */
async function unique<T>(write: Promise<T>, conflict: () => Error): Promise<T> {
  try {
    return await write
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict()
    throw error
  }
}

/** The ids of the contacts in a group, or in any group when none is given. */
function membersOf(group?: string): SQL {
  const ids = sql`select ${contactGroupMembers.contactId} from ${contactGroupMembers}`
  return group ? sql`${ids} where ${contactGroupMembers.groupId} = ${group}` : ids
}

/** The contacts the filters of the list find. */
function contactWhere(filter: ContactFilter): SQL | undefined {
  const pattern = filter.q ? containsPattern(filter.q) : null
  return and(
    filter.kind ? eq(contacts.kind, filter.kind) : undefined,
    filter.group === 'none'
      ? sql`${contacts.id} not in (${membersOf()})`
      : filter.group
        ? sql`${contacts.id} in (${membersOf(filter.group)})`
        : undefined,
    pattern
      ? or(
          ilike(sql`${contacts.firstName} || ' ' || ${contacts.lastName}`, pattern),
          ilike(sql`${contacts.lastName} || ' ' || ${contacts.firstName}`, pattern),
          ilike(contacts.email, pattern),
        )
      : undefined,
  )
}

/** By surname then name, the contacts without a surname last, then by email so pages never overlap. */
const contactOrder = [
  asc(sql`${contacts.lastName} = ''`),
  asc(sql`lower(${contacts.lastName})`),
  asc(sql`lower(${contacts.firstName})`),
  asc(contacts.email),
]

/** One page of the registry, with the groups of each contact and the role of its account, if any. */
export async function listContacts(db: DbOrTx, query: ContactListQuery): Promise<Paginated<ContactListItem>> {
  const { page, pageSize } = query
  const where = contactWhere(query)
  const [items, [totals]] = await Promise.all([
    db
      .select({
        id: contacts.id,
        kind: contacts.kind,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        groupIds: sql<string[]>`array(
          select ${contactGroupMembers.groupId} from ${contactGroupMembers}
          where ${contactGroupMembers.contactId} = ${contacts.id}
        )`,
        accountRole: users.role,
      })
      .from(contacts)
      .leftJoin(users, eq(users.email, contacts.email))
      .where(where)
      .orderBy(...contactOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(contacts).where(where),
  ])
  return { items, total: totals?.total ?? 0, page, pageSize }
}

/** Refuses ids of groups deleted meanwhile (the form had an old list). */
async function assertGroups(db: DbOrTx, groupIds: string[]): Promise<void> {
  if (!groupIds.length) return
  // Locked until the end of the transaction, so a group deleted meanwhile cannot leave a foreign key error.
  const found = await db
    .select({ id: contactGroups.id })
    .from(contactGroups)
    .where(inArray(contactGroups.id, groupIds))
    .for('share')
  if (found.length !== new Set(groupIds).size) throw httpError(400, 'Un gruppo scelto non esiste più')
}

/** Puts the contacts `where` finds in the groups, in one statement; how many memberships are new. */
async function addToGroups(db: DbOrTx, where: SQL | undefined, groupIds: string[]): Promise<number> {
  if (!groupIds.length) return 0
  const added = await db
    .insert(contactGroupMembers)
    .select(
      db
        // Every column of the table, in its order: Drizzle checks it.
        .select({
          contactId: contacts.id,
          groupId: contactGroups.id,
          createdAt: sql<Date>`now()`.as('created_at'),
        })
        .from(contacts)
        .innerJoin(contactGroups, inArray(contactGroups.id, groupIds))
        .where(where),
    )
    .onConflictDoNothing()
    .returning({ contactId: contactGroupMembers.contactId })
  return added.length
}

export async function createContact(db: DbOrTx, input: ContactInput, actor: Actor): Promise<string> {
  await assertGroups(db, input.groupIds)
  const { groupIds, ...fields } = input
  const [row] = await unique(
    db
      .insert(contacts)
      .values({ ...fields, createdBy: actor.userId })
      .returning({ id: contacts.id }),
    duplicateContact,
  )
  await addToGroups(db, eq(contacts.id, row!.id), groupIds)
  return row!.id
}

/** Changes a contact; its groups become exactly the ones given. */
export async function updateContact(db: DbOrTx, id: string, input: ContactInput): Promise<void> {
  await assertGroups(db, input.groupIds)
  const { groupIds, ...fields } = input
  const [row] = await unique(
    db.update(contacts).set(fields).where(eq(contacts.id, id)).returning({ id: contacts.id }),
    duplicateContact,
  )
  if (!row) throw httpError(404, 'Contatto non trovato')
  await db.delete(contactGroupMembers).where(eq(contactGroupMembers.contactId, id))
  await addToGroups(db, eq(contacts.id, id), groupIds)
}

export async function deleteContact(db: DbOrTx, id: string, actor: Actor): Promise<void> {
  const [row] = await db.delete(contacts).where(eq(contacts.id, id)).returning({ email: contacts.email })
  if (!row) throw httpError(404, 'Contatto non trovato')
  await audit(db, 'contact.delete', 'contact', id, { email: row.email }, actor)
}

/**
 * Adds the contacts of a list (shared/utils/contacts-import.ts read it in the browser). One contact per
 * email: an address already in the registry is not added again; with `update` it takes the type and the
 * names of the row (a blank cell, or no type, changes nothing). Every contact of the list joins the chosen
 * groups, also one another import added meanwhile.
 */
export async function importContacts(
  db: DbOrTx,
  input: ContactImportInput,
  actor: Actor,
): Promise<ContactImportResult> {
  await assertGroups(db, input.groupIds)
  const rows = [...new Map(input.rows.map(row => [row.email, row])).values()]
  const emails = rows.map(row => row.email)
  const found = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      kind: contacts.kind,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(inArray(contacts.email, emails))
  const existing = new Map(found.map(contact => [contact.email, contact]))

  const fresh = rows.filter(row => !existing.has(row.email))
  const created = fresh.length
    ? (
        await db
          .insert(contacts)
          .values(fresh.map(row => ({ ...row, kind: row.kind ?? input.kind, createdBy: actor.userId })))
          .onConflictDoNothing({ target: contacts.email })
          .returning({ id: contacts.id })
      ).length
    : 0

  const changes = input.update
    ? rows.flatMap(row => {
        const before = existing.get(row.email)
        if (!before) return []
        const after = {
          id: before.id,
          kind: row.kind ?? before.kind,
          firstName: row.firstName || before.firstName,
          lastName: row.lastName || before.lastName,
        }
        const same =
          after.kind === before.kind && after.firstName === before.firstName && after.lastName === before.lastName
        return same ? [] : [after]
      })
    : []
  if (changes.length) {
    const values = sql.join(
      changes.map(change => sql`(${change.id}::uuid, ${change.kind}, ${change.firstName}, ${change.lastName})`),
      sql`, `,
    )
    await db.execute(sql`
      update ${contacts} set kind = v.kind, first_name = v.first_name, last_name = v.last_name, updated_at = now()
      from (values ${values}) as v(id, kind, first_name, last_name)
      where ${contacts}.id = v.id`)
  }

  await addToGroups(db, inArray(contacts.email, emails), input.groupIds)
  const result = { created, existing: rows.length - created, updated: changes.length }
  await audit(db, 'contact.import', 'contact', null, { ...result, groupIds: input.groupIds }, actor)
  return result
}

/** Adds to a group, takes out of it, changes the type or deletes many contacts; how many changed. */
export async function bulkContacts(db: DbOrTx, input: ContactBulkInput, actor: Actor): Promise<number> {
  const { selection, ...action } = input
  const target = 'ids' in selection ? inArray(contacts.id, selection.ids) : contactWhere(selection.filter)
  let changed: number
  switch (action.action) {
    case 'add_to_group':
      await assertGroups(db, [action.groupId])
      changed = await addToGroups(db, target, [action.groupId])
      break
    case 'remove_from_group':
      changed = (
        await db
          .delete(contactGroupMembers)
          .where(
            and(
              eq(contactGroupMembers.groupId, action.groupId),
              inArray(contactGroupMembers.contactId, db.select({ id: contacts.id }).from(contacts).where(target)),
            ),
          )
          .returning({ id: contactGroupMembers.contactId })
      ).length
      break
    case 'set_kind':
      changed = (
        await db
          .update(contacts)
          .set({ kind: action.kind })
          .where(and(target, ne(contacts.kind, action.kind)))
          .returning({ id: contacts.id })
      ).length
      break
    case 'delete':
      changed = (await db.delete(contacts).where(target).returning({ id: contacts.id })).length
      break
  }
  await audit(db, 'contact.bulk', 'contact', null, { ...action, count: changed }, actor)
  return changed
}

/** The contacts the filters find, for the CSV: names, email, type and the names of their groups. */
export function contactsForExport(db: DbOrTx, filter: ContactFilter) {
  return db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      kind: contacts.kind,
      groups: sql<string>`coalesce(string_agg(${contactGroups.name}, ', ' order by lower(${contactGroups.name})), '')`,
    })
    .from(contacts)
    .leftJoin(contactGroupMembers, eq(contactGroupMembers.contactId, contacts.id))
    .leftJoin(contactGroups, eq(contactGroups.id, contactGroupMembers.groupId))
    .where(contactWhere(filter))
    .groupBy(contacts.id)
    .orderBy(...contactOrder)
}

// ─── Groups ──────────────────────────────────────────────────────────────────────────────────────

/** Every group in alphabetical order, with how many contacts it has. */
export function listContactGroups(db: DbOrTx): Promise<ContactGroupItem[]> {
  return db
    .select({ id: contactGroups.id, name: contactGroups.name, count: count(contactGroupMembers.contactId) })
    .from(contactGroups)
    .leftJoin(contactGroupMembers, eq(contactGroupMembers.groupId, contactGroups.id))
    .groupBy(contactGroups.id)
    .orderBy(asc(sql`lower(${contactGroups.name})`))
}

export async function createContactGroup(db: DbOrTx, input: ContactGroupInput, actor: Actor): Promise<string> {
  const [row] = await unique(db.insert(contactGroups).values(input).returning({ id: contactGroups.id }), duplicateGroup)
  await audit(db, 'contact_group.create', 'contact_group', row!.id, input, actor)
  return row!.id
}

export async function renameContactGroup(
  db: DbOrTx,
  id: string,
  input: ContactGroupInput,
  actor: Actor,
): Promise<void> {
  const [before] = await db.select({ name: contactGroups.name }).from(contactGroups).where(eq(contactGroups.id, id))
  if (!before) throw httpError(404, 'Gruppo non trovato')
  if (before.name === input.name) return
  await unique(db.update(contactGroups).set(input).where(eq(contactGroups.id, id)), duplicateGroup)
  await audit(db, 'contact_group.rename', 'contact_group', id, { from: before.name, to: input.name }, actor)
}

/** Deletes a group; its contacts stay in the registry. */
export async function deleteContactGroup(db: DbOrTx, id: string, actor: Actor): Promise<void> {
  const [row] = await db.delete(contactGroups).where(eq(contactGroups.id, id)).returning({ name: contactGroups.name })
  if (!row) throw httpError(404, 'Gruppo non trovato')
  await audit(db, 'contact_group.delete', 'contact_group', id, { name: row.name }, actor)
}
