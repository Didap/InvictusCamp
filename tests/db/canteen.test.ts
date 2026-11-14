// The canteen summary of a session (docs/spec.md 3.14): the families holding a place and the staff in play.
import { describe, expect, it } from 'vitest'
import { canteenCsv, canteenOf } from '../../server/domain/canteen'
import { saveStaffUsefulInfo } from '../../server/domain/staff'
import { makeFamily, makeSession, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()

describe('canteen', () => {
  it('counts the members of the families holding a place and the staff in play, with their needs', async () => {
    const session = await makeSession(db, { status: 'confirmed' })
    const { family } = await makeFamily(db, { name: 'Famiglia Rossi' })
    await db.insert(t.familyMembers).values([
      { familyId: family.id, firstName: 'Anna', lastName: 'Rossi', usefulInfo: { allergies: ['milk'] } },
      {
        familyId: family.id,
        firstName: 'Matteo',
        lastName: 'Rossi',
        kind: 'young',
        hasDisability: true,
        disability: { foodSelectivity: 'Solo cibi frullati' },
      },
    ])
    const { family: empty } = await makeFamily(db, { name: 'Famiglia Verdi' })
    const { family: reserve } = await makeFamily(db, { name: 'Famiglia Neri' })
    await db.insert(t.familyMembers).values({ familyId: reserve.id, firstName: 'Ugo', lastName: 'Neri' })
    await db.insert(t.sessionFamilies).values([
      { sessionId: session.id, familyId: family.id, kind: 'slot', status: 'confirmed' },
      { sessionId: session.id, familyId: empty.id, kind: 'slot', status: 'confirmed' },
      { sessionId: session.id, familyId: reserve.id, kind: 'reserve', reserveRank: 1, status: 'selected' },
    ])
    const { user: staff } = await makeStaff(db)
    const { user: declined } = await makeStaff(db)
    const actor = { userId: staff.id, ip: null }
    await saveStaffUsefulInfo(db, { userId: staff.id, value: { info: { allergies: ['milk'] }, consent: true }, actor })
    await db.insert(t.sessionStaff).values([
      { sessionId: session.id, userId: staff.id, status: 'accepted' },
      { sessionId: session.id, userId: declined.id, status: 'declined' },
    ])

    const summary = await canteenOf(db, session.id)
    expect(summary).toMatchObject({ total: 3, families: 2, staff: 1, withoutCards: ['Famiglia Verdi'] })
    expect(summary.needs).toEqual([
      { label: 'senza lattosio', people: ['Anna Rossi', `${staff.firstName} ${staff.lastName}`].sort() },
    ])
    expect(summary.notes).toEqual([{ name: 'Matteo Rossi', text: 'Selettività alimentare: Solo cibi frullati' }])
    expect((await canteenCsv(db, session.id)).csv).toContain('Totale pasti (persone a ogni pasto);3')

    // Saving nothing clears the details and the consent.
    expect(await saveStaffUsefulInfo(db, { userId: staff.id, value: { info: {}, consent: false }, actor })).toEqual({
      info: null,
      consentAt: null,
    })
  })
})
