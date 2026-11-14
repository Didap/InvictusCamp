// The history of a family's sessions (docs/spec.md 3.3): what it lived in a completed session.
import { describe, expect, it } from 'vitest'
import { familySessions } from '../../server/domain/sessions'
import { makeFamily, makeSession, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()

describe('family history', () => {
  it('shows the group, who led it and the lodging of a completed session it took part in', async () => {
    const { family } = await makeFamily(db)
    const past = await makeSession(db, { status: 'completed', startDate: '2026-06-01', endDate: '2026-06-05' })
    const next = await makeSession(db, { status: 'confirmed' })
    const [lodging] = await db.insert(t.lodgings).values({ name: 'Villetta 3', beds: 4 }).returning()
    const { user: lead } = await makeStaff(db)
    await db
      .insert(t.sessionStaff)
      .values({ sessionId: past.id, userId: lead.id, status: 'accepted', activityGroup: 'yellow' })
    const invitedAt = new Date()
    await db.insert(t.sessionFamilies).values([
      {
        sessionId: past.id,
        familyId: family.id,
        kind: 'slot',
        status: 'confirmed',
        invitedAt,
        activityGroup: 'yellow',
        lodgingId: lodging!.id,
      },
      { sessionId: next.id, familyId: family.id, kind: 'slot', status: 'confirmed', invitedAt },
    ])

    const items = await familySessions(db, family.id)
    expect(items.find(item => item.sessionId === past.id)!.lived).toEqual({
      group: 'yellow',
      groupLead: `${lead.firstName} ${lead.lastName}`,
      lodging: 'Villetta 3',
      hasProgramme: false,
    })
    expect(items.find(item => item.sessionId === next.id)!.lived).toBeNull()
  })

  it('names no leader who never accepted, and shows nothing for a family without group or lodging', async () => {
    const { family } = await makeFamily(db)
    const past = await makeSession(db, { status: 'completed', startDate: '2026-06-01', endDate: '2026-06-05' })
    const { user: drafted } = await makeStaff(db)
    await db
      .insert(t.sessionStaff)
      .values({ sessionId: past.id, userId: drafted.id, status: 'draft', activityGroup: 'red' })
    await db.insert(t.sessionFamilies).values({
      sessionId: past.id,
      familyId: family.id,
      kind: 'slot',
      status: 'confirmed',
      invitedAt: new Date(),
      activityGroup: 'red',
    })
    const [item] = await familySessions(db, family.id)
    expect(item!.lived).toEqual({ group: 'red', groupLead: null, lodging: null, hasProgramme: false })
  })
})
