// The «Anagrafica» (docs/spec.md 3.16): the people the camp keeps in touch with, with an account or without,
// their groups, the bulk import of a pasted list and the actions on many contacts at once. Explicit imports
// only, so the database tests load this module directly.
import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
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
import type { ContactKind } from '../../shared/utils/constants'
import { contactGroupMembers, contactGroups, contacts, users } from '../db/schema'
import { writeAudit } from './audit'
import { isUniqueViolation, type DbOrTx } from './db'
import { containsPattern, httpError, type Actor } from './users'

const duplicateContact = () => httpError(409, 'Questa email è già in anagrafica: cercala nell’elenco')
const duplicateGroup = () => httpError(409, 'Esiste già un gruppo con questo nome')

/** Inserts and deletes with one parameter per value stay well under the 65535 of Postgres. */
const CHUNK = 2000
function chunks<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

function audit(db: DbOrTx, action: string, entityType: string, entityId: string | null, data: object, actor: Actor) {
  return writeAudit(db, { actorUserId: actor.userId, action, entityType, entityId, data: { ...data }, ip: actor.ip })
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

/**
 * The contacts the filters of the list find. The group subquery names the outer row in full: Drizzle leaves
 * columns unqualified when a query reads one table, and a bare `id` would be read inside the subquery.
 */
function contactWhere(filter: ContactFilter): SQL | undefined {
  const pattern = filter.q ? containsPattern(filter.q) : null
  const memberOf = (group?: string) =>
    sql`exists (select 1 from contact_group_members m where m.contact_id = "contacts"."id"${
      group ? sql` and m.group_id = ${group}` : sql``
    })`
  return and(
    filter.kind ? eq(contacts.kind, filter.kind) : undefined,
    filter.group === 'none' ? sql`not ${memberOf()}` : filter.group ? memberOf(filter.group) : undefined,
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
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: contacts.id,
        kind: contacts.kind,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        createdAt: contacts.createdAt,
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
  const ids = rows.map(row => row.id)
  const memberships = ids.length
    ? await db
        .select({ contactId: contactGroupMembers.contactId, groupId: contactGroupMembers.groupId })
        .from(contactGroupMembers)
        .where(inArray(contactGroupMembers.contactId, ids))
    : []
  return {
    items: rows.map(row => ({
      ...row,
      groupIds: memberships.filter(m => m.contactId === row.id).map(m => m.groupId),
      createdAt: row.createdAt.toISOString(),
    })),
    total: totals?.total ?? 0,
    page,
    pageSize,
  }
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

/** Puts the contacts in the groups; how many memberships are new. */
async function addToGroups(db: DbOrTx, contactIds: string[], groupIds: string[]): Promise<number> {
  const pairs = contactIds.flatMap(contactId => groupIds.map(groupId => ({ contactId, groupId })))
  let added = 0
  for (const part of chunks(pairs)) {
    const rows = await db
      .insert(contactGroupMembers)
      .values(part)
      .onConflictDoNothing()
      .returning({ contactId: contactGroupMembers.contactId })
    added += rows.length
  }
  return added
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
  await addToGroups(db, [row!.id], groupIds)
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
  await addToGroups(db, [id], groupIds)
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
 * groups. One statement per chunk, never one per row: the production database is a network hop away.
 */
export async function importContacts(
  db: DbOrTx,
  input: ContactImportInput,
  actor: Actor,
): Promise<ContactImportResult> {
  await assertGroups(db, input.groupIds)
  const rows = [...new Map(input.rows.map(row => [row.email, row])).values()]
  const byEmail = async () => {
    const found: { id: string; email: string; kind: ContactKind; firstName: string; lastName: string }[] = []
    for (const part of chunks(rows.map(row => row.email))) {
      found.push(
        ...(await db
          .select({
            id: contacts.id,
            email: contacts.email,
            kind: contacts.kind,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
          })
          .from(contacts)
          .where(inArray(contacts.email, part))),
      )
    }
    return new Map(found.map(({ email, ...contact }) => [email, contact]))
  }
  const existing = await byEmail()

  let created = 0
  for (const part of chunks(rows.filter(row => !existing.has(row.email)))) {
    const inserted = await db
      .insert(contacts)
      .values(part.map(row => ({ ...row, kind: row.kind ?? input.kind, createdBy: actor.userId })))
      .onConflictDoNothing({ target: contacts.email })
      .returning({ id: contacts.id })
    created += inserted.length
  }

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
  for (const part of chunks(changes)) {
    const values = sql.join(
      part.map(change => sql`(${change.id}::uuid, ${change.kind}, ${change.firstName}, ${change.lastName})`),
      sql`, `,
    )
    await db.execute(sql`
      update ${contacts} set kind = v.kind, first_name = v.first_name, last_name = v.last_name, updated_at = now()
      from (values ${values}) as v(id, kind, first_name, last_name)
      where ${contacts}.id = v.id`)
  }

  // Read again: a row another import added meanwhile was skipped above, but is in the list all the same.
  if (input.groupIds.length) {
    await addToGroups(
      db,
      [...(await byEmail()).values()].map(contact => contact.id),
      input.groupIds,
    )
  }
  const result = { created, existing: rows.length - created, updated: changes.length }
  await audit(db, 'contact.import', 'contact', null, { ...result, groupIds: input.groupIds }, actor)
  return result
}

/** The ids an action applies to: the ones ticked that still exist, or every contact the filters find. */
async function selected(db: DbOrTx, selection: ContactBulkInput['selection']): Promise<string[]> {
  const where = 'ids' in selection ? inArray(contacts.id, selection.ids) : contactWhere(selection.filter)
  const rows = await db.select({ id: contacts.id }).from(contacts).where(where)
  return rows.map(row => row.id)
}

/** Adds to a group, takes out of it, changes the type or deletes many contacts; how many changed. */
export async function bulkContacts(db: DbOrTx, input: ContactBulkInput, actor: Actor): Promise<number> {
  if (input.action === 'add_to_group' || input.action === 'remove_from_group') {
    await assertGroups(db, [input.groupId])
  }
  let changed = 0
  for (const part of chunks(await selected(db, input.selection))) {
    switch (input.action) {
      case 'add_to_group':
        changed += await addToGroups(db, part, [input.groupId])
        break
      case 'remove_from_group':
        changed += (
          await db
            .delete(contactGroupMembers)
            .where(and(eq(contactGroupMembers.groupId, input.groupId), inArray(contactGroupMembers.contactId, part)))
            .returning({ contactId: contactGroupMembers.contactId })
        ).length
        break
      case 'set_kind':
        changed += (
          await db
            .update(contacts)
            .set({ kind: input.kind })
            .where(and(inArray(contacts.id, part), sql`${contacts.kind} <> ${input.kind}`))
            .returning({ id: contacts.id })
        ).length
        break
      case 'delete':
        changed += (await db.delete(contacts).where(inArray(contacts.id, part)).returning({ id: contacts.id })).length
        break
    }
  }
  const { selection: _selection, ...action } = input
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
