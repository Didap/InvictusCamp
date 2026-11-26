// The «Anagrafica» (docs/spec.md 3.16): contacts, groups, the bulk import and the bulk actions.
import { describe, expect, it } from 'vitest'
import {
  bulkContacts,
  contactsForExport,
  createContact,
  createContactGroup,
  deleteContactGroup,
  importContacts,
  listContactGroups,
  listContacts,
  renameContactGroup,
  updateContact,
} from '../../server/domain/contacts'
import { contactListQuery } from '../../shared/schemas/contacts'
import { makeAdmin, makeUser, t, useTestDb } from './helpers'

const db = useTestDb()

async function setup() {
  const admin = await makeAdmin(db)
  return { userId: admin.id, ip: '127.0.0.1' }
}

const list = (query: Record<string, unknown> = {}) => listContacts(db, contactListQuery.parse(query))
const emails = async (query: Record<string, unknown> = {}) => (await list(query)).items.map(item => item.email)

describe('contacts', () => {
  it('adds a contact with its groups and finds its account by the email', async () => {
    const actor = await setup()
    await makeUser(db, { email: 'mario@example.it', role: 'family' })
    const group = await createContactGroup(db, { name: 'Famiglie 2026' }, actor)
    const id = await createContact(
      db,
      { kind: 'family', firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.it', groupIds: [group] },
      actor,
    )
    const [item] = (await list()).items
    expect(item).toMatchObject({ id, kind: 'family', groupIds: [group], accountRole: 'family' })

    await expect(
      createContact(db, { kind: 'staff', firstName: '', lastName: '', email: 'mario@example.it', groupIds: [] }, actor),
    ).rejects.toMatchObject({ statusCode: 409 })

    await updateContact(db, id, {
      kind: 'supporter',
      firstName: 'Mario',
      lastName: 'Rossi',
      email: 'mario@example.it',
      groupIds: [],
    })
    expect((await list()).items[0]).toMatchObject({ kind: 'supporter', groupIds: [] })
  })

  it('imports a list once per email, updating the existing ones only when asked', async () => {
    const actor = await setup()
    const group = await createContactGroup(db, { name: 'Newsletter' }, actor)
    await createContact(
      db,
      { kind: 'other', firstName: 'Anna', lastName: '', email: 'anna@example.it', groupIds: [] },
      actor,
    )
    const rows = [
      { firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.it', kind: null },
      { firstName: '', lastName: 'Bianchi', email: 'anna@example.it', kind: 'staff' as const },
      { firstName: 'Luca', lastName: '', email: 'luca@example.it', kind: 'volunteer' as const },
    ]
    expect(await importContacts(db, { rows, kind: 'family', groupIds: [group], update: false }, actor)).toEqual({
      created: 2,
      existing: 1,
      updated: 0,
    })
    const items = (await list()).items
    expect(items.map(item => [item.email, item.kind, item.firstName, item.lastName])).toEqual([
      ['mario@example.it', 'family', 'Mario', 'Rossi'],
      ['anna@example.it', 'other', 'Anna', ''],
      ['luca@example.it', 'volunteer', 'Luca', ''],
    ])
    expect(items.every(item => item.groupIds.includes(group))).toBe(true)

    // With `update`, a row without a type keeps the contact's: Mario stays a family, not «Altro».
    expect(await importContacts(db, { rows, kind: 'other', groupIds: [], update: true }, actor)).toEqual({
      created: 0,
      existing: 3,
      updated: 1,
    })
    const anna = (await list({ q: 'anna' })).items[0]
    expect(anna).toMatchObject({ kind: 'staff', firstName: 'Anna', lastName: 'Bianchi' })
    expect((await list({ q: 'mario' })).items[0]).toMatchObject({ kind: 'family' })
  })

  it('filters by name, type and group, and acts on the ones ticked or on every one found', async () => {
    const actor = await setup()
    const donors = await createContactGroup(db, { name: 'Donatori' }, actor)
    const rows = ['a', 'b', 'c', 'd'].map((letter, index) => ({
      firstName: `Nome ${letter}`,
      lastName: `Cognome ${letter}`,
      email: `${letter}@example.it`,
      kind: index < 2 ? ('supporter' as const) : ('family' as const),
    }))
    await importContacts(db, { rows, kind: 'other', groupIds: [], update: false }, actor)
    expect(await emails({ kind: 'supporter' })).toEqual(['a@example.it', 'b@example.it'])
    expect(await emails({ q: 'cognome c' })).toEqual(['c@example.it'])

    expect(
      await bulkContacts(
        db,
        { selection: { filter: { kind: 'supporter' } }, action: 'add_to_group', groupId: donors },
        actor,
      ),
    ).toBe(2)
    expect(await emails({ group: donors })).toEqual(['a@example.it', 'b@example.it'])
    expect(await emails({ group: 'none' })).toEqual(['c@example.it', 'd@example.it'])

    const [a] = (await list({ q: 'a@' })).items
    expect(
      await bulkContacts(db, { selection: { ids: [a!.id] }, action: 'remove_from_group', groupId: donors }, actor),
    ).toBe(1)
    expect(await bulkContacts(db, { selection: { filter: {} }, action: 'set_kind', kind: 'family' }, actor)).toBe(2)
    expect((await contactsForExport(db, { group: donors })).map(row => [row.email, row.groups])).toEqual([
      ['b@example.it', 'Donatori'],
    ])
    expect(await bulkContacts(db, { selection: { filter: { q: 'a@' } }, action: 'delete' }, actor)).toBe(1)
    expect((await list()).total).toBe(3)
  })

  it('renames and deletes groups; their contacts stay', async () => {
    const actor = await setup()
    const group = await createContactGroup(db, { name: 'Scuole' }, actor)
    await expect(createContactGroup(db, { name: 'scuole' }, actor)).rejects.toMatchObject({ statusCode: 409 })
    await createContact(
      db,
      { kind: 'partner', firstName: '', lastName: '', email: 's@example.it', groupIds: [group] },
      actor,
    )
    await renameContactGroup(db, group, { name: 'Scuole e enti' }, actor)
    expect(await listContactGroups(db)).toEqual([{ id: group, name: 'Scuole e enti', count: 1 }])
    await deleteContactGroup(db, group, actor)
    expect(await listContactGroups(db)).toEqual([])
    expect((await list()).items[0]?.groupIds).toEqual([])
    const audits = await db.select({ action: t.auditLog.action }).from(t.auditLog)
    expect(audits.map(row => row.action)).toEqual(
      expect.arrayContaining(['contact_group.create', 'contact_group.rename', 'contact_group.delete']),
    )
  })
})
