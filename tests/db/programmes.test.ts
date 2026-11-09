// The week programme against a real database: one per year, the copy of a session, the revision that
// stops two people overwriting each other, and who may read the programme of a session.
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  adminSessionProgramme,
  copyProgrammeToSession,
  createYearProgramme,
  dropSessionProgramme,
  familyProgramme,
  getYearProgramme,
  listYearProgrammes,
  saveSessionProgramme,
  saveYearProgramme,
  staffProgramme,
} from '../../server/domain/programmes'
import { emptyWeek } from '../../shared/content/programme-template'
import { makeAdmin, makeFamily, makeSession, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()

async function withYear(year = 2027) {
  const admin = await makeAdmin(db)
  const actor = { userId: admin.id, ip: null }
  await createYearProgramme(db, { values: { year, from: 'template' }, actor })
  return actor
}

describe('programme of a year', () => {
  it('is created once, from the model week, empty or as a copy of another year', async () => {
    const actor = await withYear(2027)
    const ofYear = await getYearProgramme(db, 2027)
    expect(ofYear).toMatchObject({ year: 2027, sessionId: null, revision: 1, updatedByName: 'Giulia Conte' })
    expect(ofYear.content.days).toHaveLength(5)

    await expect(createYearProgramme(db, { values: { year: 2027, from: 'empty' }, actor })).rejects.toMatchObject({
      statusCode: 409,
    })
    await createYearProgramme(db, { values: { year: 2028, from: 2027 }, actor })
    expect((await getYearProgramme(db, 2028)).content).toEqual(ofYear.content)
    await expect(createYearProgramme(db, { values: { year: 2029, from: 2020 }, actor })).rejects.toMatchObject({
      statusCode: 404,
    })

    const audit = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'programme.create'))
    expect(audit).toHaveLength(2)
  })

  it('refuses a save over a revision someone else already saved', async () => {
    const actor = await withYear()
    const content = emptyWeek()
    const saved = await saveYearProgramme(db, { year: 2027, values: { revision: 1, content }, actor })
    expect(saved.revision).toBe(2)
    expect(saved.content.days[0]!.blocks).toEqual([])

    await expect(saveYearProgramme(db, { year: 2027, values: { revision: 1, content }, actor })).rejects.toMatchObject({
      statusCode: 409,
    })
    await expect(saveYearProgramme(db, { year: 2030, values: { revision: 1, content }, actor })).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('lists the years with a programme and the years whose sessions wait for one', async () => {
    const actor = await withYear(2027)
    const june = await makeSession(db, { startDate: '2027-06-21', endDate: '2027-06-25' })
    await makeSession(db, { startDate: '2027-07-12', endDate: '2027-07-16' })
    await makeSession(db, { startDate: '2027-09-06', endDate: '2027-09-10', status: 'cancelled' })
    await makeSession(db, { startDate: '2028-06-19', endDate: '2028-06-23' })
    await copyProgrammeToSession(db, { sessionId: june.id, actor })

    const items = await listYearProgrammes(db)
    expect(items.map(({ year, exists, sessions, copies }) => ({ year, exists, sessions, copies }))).toEqual([
      { year: 2028, exists: false, sessions: 1, copies: 0 },
      { year: 2027, exists: true, sessions: 2, copies: 1 },
    ])
  })
})

describe('programme of a session', () => {
  it('uses the year’s programme until it gets a copy, and goes back when the copy is dropped', async () => {
    const actor = await withYear()
    const session = await makeSession(db, { startDate: '2027-06-21', endDate: '2027-06-27' })
    const before = await adminSessionProgramme(db, session.id)
    expect(before).toMatchObject({ year: 2027, source: 'year', editable: true })
    expect(before.dates).toHaveLength(7)

    await copyProgrammeToSession(db, { sessionId: session.id, actor })
    await expect(copyProgrammeToSession(db, { sessionId: session.id, actor })).rejects.toMatchObject({
      statusCode: 409,
    })

    const copy = await adminSessionProgramme(db, session.id)
    expect(copy.source).toBe('session')
    const after = await saveSessionProgramme(db, {
      sessionId: session.id,
      values: { revision: copy.programme!.revision, content: emptyWeek() },
      actor,
    })
    expect(after.programme!.content.days[0]!.blocks).toEqual([])
    expect((await getYearProgramme(db, 2027)).content.days[0]!.blocks.length).toBeGreaterThan(0)

    await dropSessionProgramme(db, { sessionId: session.id, actor })
    expect((await adminSessionProgramme(db, session.id)).source).toBe('year')
  })

  it('has none while its year has no programme, and cannot be copied then', async () => {
    const admin = await makeAdmin(db)
    const session = await makeSession(db, { startDate: '2031-06-23', endDate: '2031-06-27' })
    expect(await adminSessionProgramme(db, session.id)).toMatchObject({ year: 2031, source: 'none', programme: null })
    await expect(
      copyProgrammeToSession(db, { sessionId: session.id, actor: { userId: admin.id } }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('is not changed once the session is completed or cancelled', async () => {
    const actor = await withYear()
    const session = await makeSession(db, { status: 'completed' })
    expect((await adminSessionProgramme(db, session.id)).editable).toBe(false)
    await expect(copyProgrammeToSession(db, { sessionId: session.id, actor })).rejects.toMatchObject({
      statusCode: 409,
    })
    await expect(dropSessionProgramme(db, { sessionId: session.id, actor })).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('who reads the programme of a session', () => {
  async function setup() {
    await withYear()
    const session = await makeSession(db, { status: 'inviting' })
    const family = await makeFamily(db)
    const other = await makeFamily(db)
    const staff = await makeStaff(db)
    return { session, family, other, staff }
  }

  async function participate(sessionId: string, familyId: string, status: 'invited' | 'confirmed' | 'declined') {
    await db.insert(t.sessionFamilies).values({ sessionId, familyId, kind: 'slot', status })
  }

  it('a family invited or confirmed in it, without staff blocks or internal notes', async () => {
    const { session, family } = await setup()
    await participate(session.id, family.family.id, 'invited')
    const view = await familyProgramme(db, { familyId: family.family.id, sessionId: session.id })
    const blocks = view.content!.days.flatMap(day => day.blocks)
    expect(blocks.some(block => block.kind === 'staff')).toBe(false)
    expect(blocks.every(block => block.staffNote === '' && !block.isNew)).toBe(true)
    expect(view.session.id).toBe(session.id)

    await db
      .update(t.sessionFamilies)
      .set({ status: 'confirmed' })
      .where(and(eq(t.sessionFamilies.sessionId, session.id), eq(t.sessionFamilies.familyId, family.family.id)))
    expect((await familyProgramme(db, { familyId: family.family.id, sessionId: session.id })).content).not.toBeNull()
  })

  it('not a family that declined, another family, or anyone once the session is cancelled', async () => {
    const { session, family, other } = await setup()
    await participate(session.id, family.family.id, 'declined')
    await participate(session.id, other.family.id, 'confirmed')
    await expect(familyProgramme(db, { familyId: family.family.id, sessionId: session.id })).rejects.toMatchObject({
      statusCode: 404,
    })
    await db.update(t.campSessions).set({ status: 'cancelled' }).where(eq(t.campSessions.id, session.id))
    await expect(familyProgramme(db, { familyId: other.family.id, sessionId: session.id })).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('staff who accepted the convocation, with staff blocks and internal notes', async () => {
    const { session, staff } = await setup()
    await db.insert(t.sessionStaff).values({ sessionId: session.id, userId: staff.user.id, status: 'sent' })
    await expect(staffProgramme(db, { userId: staff.user.id, sessionId: session.id })).rejects.toMatchObject({
      statusCode: 404,
    })
    await db.update(t.sessionStaff).set({ status: 'accepted' }).where(eq(t.sessionStaff.userId, staff.user.id))
    const view = await staffProgramme(db, { userId: staff.user.id, sessionId: session.id })
    const blocks = view.content!.days.flatMap(day => day.blocks)
    expect(blocks.some(block => block.kind === 'staff')).toBe(true)
    expect(blocks.some(block => block.staffNote !== '')).toBe(true)
  })

  it('reads the session’s copy when it has one, and nothing while there is no programme', async () => {
    const admin = await makeAdmin(db)
    const session = await makeSession(db, { status: 'inviting', startDate: '2031-06-23', endDate: '2031-06-27' })
    const family = await makeFamily(db)
    await participate(session.id, family.family.id, 'confirmed')
    expect((await familyProgramme(db, { familyId: family.family.id, sessionId: session.id })).content).toBeNull()

    const actor = { userId: admin.id }
    await createYearProgramme(db, { values: { year: 2031, from: 'template' }, actor })
    await copyProgrammeToSession(db, { sessionId: session.id, actor })
    await saveSessionProgramme(db, { sessionId: session.id, values: { revision: 1, content: emptyWeek() }, actor })
    const view = await familyProgramme(db, { familyId: family.family.id, sessionId: session.id })
    expect(view.content!.days.flatMap(day => day.blocks)).toEqual([])
  })
})
