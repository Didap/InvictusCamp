// The canteen summary of a session (docs/spec.md 3.14): the families holding a place, the staff and the v-team
// in play.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { canteenCsv, canteenOf, canteenPdf, canteenPdfBlocks } from '../../server/domain/canteen'
import { saveStaffUsefulInfo } from '../../server/domain/staff'
import { sniffMimeType } from '../../server/domain/storage'
import { makeFamily, makeSession, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()

describe('canteen', () => {
  it('counts the members of the families holding a place, the staff and the v-team in play, with their needs', async () => {
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
    const { user: volunteer, profile } = await makeStaff(db)
    await db.update(t.staffProfiles).set({ team: 'volunteer' }).where(eq(t.staffProfiles.id, profile.id))
    const actor = { userId: staff.id, ip: null }
    await saveStaffUsefulInfo(db, {
      userId: staff.id,
      value: {
        info: { allergies: ['milk'] },
        nonFoodAllergies: { allergies: ['cat_hair'], other: 'Penicillina' },
        otherInfo: 'Daltonismo',
        consent: true,
      },
      actor,
    })
    await saveStaffUsefulInfo(db, {
      userId: volunteer.id,
      value: { info: { diet: 'vegetarian' }, consent: true },
      actor: { userId: volunteer.id, ip: null },
    })
    await db.insert(t.sessionStaff).values([
      { sessionId: session.id, userId: staff.id, status: 'accepted' },
      { sessionId: session.id, userId: declined.id, status: 'declined' },
      { sessionId: session.id, userId: volunteer.id, status: 'sent' },
    ])

    const summary = await canteenOf(db, session.id)
    expect(summary).toMatchObject({
      total: 4,
      families: 1,
      familyPeople: 2,
      staff: 1,
      volunteers: 1,
      withoutCards: ['Famiglia Verdi'],
    })
    const volunteerName = `${volunteer.firstName} ${volunteer.lastName}`
    expect(summary.needs).toEqual([
      { label: 'senza lattosio', people: ['Anna Rossi', `${staff.firstName} ${staff.lastName}`].sort() },
      { label: 'vegetariana', people: [volunteerName] },
    ])
    expect(summary.notes).toEqual([{ name: 'Matteo Rossi', text: 'Selettività alimentare: Solo cibi frullati' }])
    const { csv } = await canteenCsv(db, session.id)
    expect(csv).toContain('Totale pasti (persone a ogni pasto);4')
    expect(csv).toContain('V-team;1')

    // The PDF for the supplier: the total, then each need with how many and who.
    expect(canteenPdfBlocks(summary)).toEqual(
      expect.arrayContaining([
        { heading: 'Totale pasti: 4' },
        'Persone a ogni pasto: 2 di 1 famiglia, 1 dello staff e 1 del v-team.',
        '1 famiglia non ha ancora indicato i componenti e non è nel totale.',
        { label: '1 vegetariana' },
        volunteerName,
      ]),
    )
    // The allergies not to food and the other details never reach the canteen.
    expect(JSON.stringify(await canteenOf(db, session.id))).not.toMatch(/cat_hair|gatto|Penicillina|Daltonismo/)
    const pdf = await canteenPdf(db, session.id)
    expect(pdf.filename).toBe('mensa-sessione-di-prova-21-06-2027.pdf')
    expect(sniffMimeType(pdf.data)).toBe('application/pdf')

    // Saving nothing clears the details and the consent.
    expect(await saveStaffUsefulInfo(db, { userId: staff.id, value: { info: {}, consent: false }, actor })).toEqual({
      info: null,
      nonFoodAllergies: null,
      otherInfo: null,
      consentAt: null,
    })
  })
})
