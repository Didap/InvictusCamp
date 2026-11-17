// Roles of staff and v-team and tags of the «Valutazione» against a real database (docs/spec.md 3.4): the
// administration creates, renames and deletes them; deleting takes them away from profiles and convocations;
// the coordinator stays. Names are unique per test: these tables survive truncateAll (migration 0023 fills them).
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  addConvocations,
  saveApplicationDraft,
  sessionStaffData,
  setStaffRoles,
  setStaffTags,
  staffDetail,
  staffList,
} from '../../server/domain/staff'
import {
  checkLabels,
  createStaffRole,
  createStaffTag,
  deleteStaffLabel,
  renameStaffRole,
  staffLabels,
  updateStaffTag,
} from '../../server/domain/staff-labels'
import { COORDINATOR_ROLE, GROUP_LEAD_ROLE } from '../../shared/utils/constants'
import { makeAdmin, makeSession, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()
const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

async function profile(userId: string) {
  const [row] = await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.userId, userId))
  return row!
}

describe('roles', () => {
  it('come from migration 0023 with the keys of the old list, and new ones go last', async () => {
    const admin = await makeAdmin(db)
    const before = await staffLabels(db)
    expect(before.roles.slice(0, 4).map(role => role.id)).toEqual([
      'coordinator',
      'group_lead',
      'activity_lead',
      'other',
    ])
    const name = unique('Fotografo')
    const id = await createStaffRole(db, { name }, { userId: admin.id })
    const after = await staffLabels(db)
    expect(after.roles.at(-1)).toMatchObject({ id, name, people: 0, convocations: 0 })
    await deleteStaffLabel(db, 'role', id, { userId: admin.id })
  })

  it('refuse a name already taken, whatever the case', async () => {
    const admin = await makeAdmin(db)
    const name = unique('Cuoco')
    const id = await createStaffRole(db, { name }, { userId: admin.id })
    await expect(createStaffRole(db, { name: name.toUpperCase() }, { userId: admin.id })).rejects.toMatchObject({
      statusCode: 409,
    })
    await expect(renameStaffRole(db, 'other', { name }, { userId: admin.id })).rejects.toMatchObject({
      statusCode: 409,
    })
    // Renaming to itself (another case) is fine.
    await renameStaffRole(db, id, { name: name.toUpperCase() }, { userId: admin.id })
    await deleteStaffLabel(db, 'role', id, { userId: admin.id })
  })

  it('deleting one takes it from profiles and convocations, with the count in the audit', async () => {
    const admin = await makeAdmin(db)
    const id = await createStaffRole(db, { name: unique('Bagnino') }, { userId: admin.id })
    const { user } = await makeStaff(db, 'approved')
    await db
      .update(t.staffProfiles)
      .set({ roles: [id, 'other'] })
      .where(eq(t.staffProfiles.userId, user.id))
    const session = await makeSession(db)
    await db.insert(t.sessionAvailability).values({ sessionId: session.id, userId: user.id })
    await addConvocations(db, {
      sessionId: session.id,
      people: [{ userId: user.id, role: id }],
      actor: { userId: admin.id },
    })
    expect((await staffLabels(db)).roles.find(role => role.id === id)).toMatchObject({ people: 1, convocations: 1 })

    await deleteStaffLabel(db, 'role', id, { userId: admin.id })
    expect((await profile(user.id)).roles).toEqual(['other'])
    const [convocation] = await db.select().from(t.sessionStaff).where(eq(t.sessionStaff.userId, user.id))
    expect(convocation!.role).toBeNull()
    const [audit] = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'staff_role.delete'))
    expect(audit).toMatchObject({ entityId: null, data: { id, people: 1, convocations: [convocation!.id] } })
  })

  it('the coordinator and the group lead cannot be deleted, only renamed', async () => {
    const admin = await makeAdmin(db)
    for (const id of [COORDINATOR_ROLE, GROUP_LEAD_ROLE]) {
      await expect(deleteStaffLabel(db, 'role', id, { userId: admin.id })).rejects.toMatchObject({ statusCode: 409 })
    }
    await renameStaffRole(db, COORDINATOR_ROLE, { name: 'Coordinatore di squadra' }, { userId: admin.id })
    expect((await staffLabels(db)).roles[0]!.name).toBe('Coordinatore di squadra')
    await renameStaffRole(db, COORDINATOR_ROLE, { name: 'Coordinatore' }, { userId: admin.id })
  })

  it('a role that does not exist is refused in the application, on a person and on a convocation', async () => {
    const admin = await makeAdmin(db)
    await expect(checkLabels(db, 'role', ['other', 'chef'])).rejects.toMatchObject({ statusCode: 409 })
    expect(await checkLabels(db, 'role', ['other', 'other'])).toEqual(['other'])
    const { user } = await makeStaff(db, 'approved')
    await expect(
      setStaffRoles(db, { userId: user.id, roles: ['chef'], actor: { userId: admin.id } }),
    ).rejects.toMatchObject({ statusCode: 409 })
    const session = await makeSession(db)
    await expect(
      addConvocations(db, {
        sessionId: session.id,
        people: [{ userId: user.id, role: 'chef' }],
        actor: { userId: admin.id },
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('roles of a person', () => {
  it('a role deleted while the application form is open is left out of the draft', async () => {
    const admin = await makeAdmin(db)
    const id = await createStaffRole(db, { name: unique('Autista') }, { userId: admin.id })
    const { user } = await makeStaff(db, 'registered')
    await deleteStaffLabel(db, 'role', id, { userId: admin.id })
    await saveApplicationDraft(db, user.id, { roles: [id, 'other'] })
    expect((await profile(user.id)).roles).toEqual(['other'])
  })

  it('are the administration’s once the application is sent, audited', async () => {
    const admin = await makeAdmin(db)
    const draft = await makeStaff(db, 'registered')
    await expect(
      setStaffRoles(db, { userId: draft.user.id, roles: ['other'], actor: { userId: admin.id } }),
    ).rejects.toMatchObject({ statusCode: 409 })

    const { user } = await makeStaff(db, 'applied')
    await setStaffRoles(db, { userId: user.id, roles: ['group_lead', 'other'], actor: { userId: admin.id } })
    expect((await profile(user.id)).roles).toEqual(['group_lead', 'other'])
    // The same roles again write nothing.
    await setStaffRoles(db, { userId: user.id, roles: ['other', 'group_lead'], actor: { userId: admin.id } })
    const audits = await db.select().from(t.auditLog).where(eq(t.auditLog.entityId, user.id))
    expect(audits.map(row => row.action)).toEqual(['staff.roles'])
  })
})

describe('tags of the «Valutazione»', () => {
  it('are given to people, shown in the list, the detail and the people to add, and taken away on delete', async () => {
    const admin = await makeAdmin(db)
    const leader = await createStaffTag(db, { name: unique('Leader'), color: 'info' }, { userId: admin.id })
    const top = await createStaffTag(db, { name: unique('Top'), color: 'success' }, { userId: admin.id })
    const { user } = await makeStaff(db, 'approved')
    await db.update(t.staffProfiles).set({ birthDate: '1990-05-01' }).where(eq(t.staffProfiles.userId, user.id))
    await setStaffTags(db, { userId: user.id, tags: [leader, top], actor: { userId: admin.id } })

    const [row] = (await staffList(db)).filter(person => person.userId === user.id)
    expect(row).toMatchObject({ tags: [leader, top], birthDate: '1990-05-01' })
    expect((await staffDetail(db, user.id)).tags).toEqual([leader, top])
    const session = await makeSession(db)
    await db.insert(t.sessionAvailability).values({ sessionId: session.id, userId: user.id })
    expect((await sessionStaffData(db, session.id)).available[0]).toMatchObject({
      tags: [leader, top],
      birthDate: '1990-05-01',
    })
    expect((await staffLabels(db)).tags.find(tag => tag.id === leader)).toMatchObject({ color: 'info', people: 1 })

    await updateStaffTag(db, leader, { name: unique('Guida'), color: 'warning' }, { userId: admin.id })
    await deleteStaffLabel(db, 'tag', top, { userId: admin.id })
    expect((await profile(user.id)).tags).toEqual([leader])
    await deleteStaffLabel(db, 'tag', leader, { userId: admin.id })
    expect((await profile(user.id)).tags).toEqual([])
  })

  it('a tag deleted meanwhile is refused', async () => {
    const admin = await makeAdmin(db)
    const { user } = await makeStaff(db, 'approved')
    await expect(
      setStaffTags(db, { userId: user.id, tags: [randomUUID()], actor: { userId: admin.id } }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})
