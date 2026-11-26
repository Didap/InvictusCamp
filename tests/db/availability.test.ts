// The availability of the staff against a real database (docs/spec.md 3.5): answers saved one by one, fixed by
// «Conferma le preferenze» for the sessions the page showed, reopened only by the administration after «Chiedi il
// reset». A session not confirmed yet (shown later, or with new dates) is answered and confirmed in turn.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { updateSession } from '../../server/domain/sessions'
import {
  changeStaffStatus,
  confirmAvailability,
  myAvailability,
  reopenAvailability,
  requestAvailabilityReset,
  setAvailability,
  staffHome,
} from '../../server/domain/staff'
import { makeAdmin, makeSession, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx = { appUrl: 'http://localhost:3080' }
const TODAY = '2027-01-10'

const profileOf = async (userId: string) =>
  (await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.userId, userId)))[0]!
const lockedOf = async (userId: string) =>
  (await myAvailability(db, await profileOf(userId), TODAY)).sessions.map(s => [s.title, s.available, s.locked])

describe('staff availability', () => {
  it('fixes the sessions shown, leaves the others open, and is reopened by the administration', async () => {
    const admin = await makeAdmin(db)
    const { user } = await makeStaff(db)
    const actor = { userId: user.id, ip: null }
    const adminActor = { userId: admin.id, ip: null }
    const june = await makeSession(db, { title: 'Giugno' })
    const july = await makeSession(db, { title: 'Luglio', startDate: '2027-07-05', endDate: '2027-07-11' })
    await setAvailability(db, { userId: user.id, sessionId: june.id, available: true }, TODAY)
    expect((await staffHome(db, await profileOf(user.id), TODAY)).availability).toEqual({
      available: 1,
      total: 2,
      toConfirm: 2,
    })
    // Before the confirmation there is no reset to ask for.
    await expect(requestAvailabilityReset(db, { userId: user.id, actor }, TODAY)).rejects.toMatchObject({
      statusCode: 409,
    })

    // The page showed June only (July came while it was open): June is fixed, July stays to answer.
    await confirmAvailability(db, { userId: user.id, sessionIds: [june.id], actor }, TODAY)
    expect((await myAvailability(db, await profileOf(user.id), TODAY)).confirmedAt).not.toBeNull()
    expect(await lockedOf(user.id)).toEqual([
      ['Giugno', true, true],
      ['Luglio', false, false],
    ])
    await expect(
      setAvailability(db, { userId: user.id, sessionId: june.id, available: false }, TODAY),
    ).rejects.toMatchObject({ statusCode: 409 })
    await setAvailability(db, { userId: user.id, sessionId: july.id, available: true }, TODAY)
    await confirmAvailability(db, { userId: user.id, sessionIds: [june.id, july.id], actor }, TODAY)
    const audits = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'staff.availability_confirm'))
    expect(audits.map(a => a.data)).toEqual([
      { sessions: [june.id], available: [june.id] },
      { sessions: [july.id], available: [july.id] },
    ])

    // New dates for July: its answer is open again, to change and confirm.
    await updateSession(db, {
      sessionId: july.id,
      values: { ...july, startDate: '2027-07-12', endDate: '2027-07-18' },
      actor: adminActor,
    })
    expect(await lockedOf(user.id)).toEqual([
      ['Giugno', true, true],
      ['Luglio', true, false],
    ])

    // «Chiedi il reset», once; the administration reopens and the person hears it by email.
    await requestAvailabilityReset(db, { userId: user.id, actor }, TODAY)
    const asked = (await profileOf(user.id)).availabilityResetRequestedAt
    expect(asked).not.toBeNull()
    await requestAvailabilityReset(db, { userId: user.id, actor }, TODAY)
    expect((await profileOf(user.id)).availabilityResetRequestedAt).toEqual(asked)
    const [email] = await reopenAvailability(db, { userId: user.id, ctx, actor: adminActor }, TODAY)
    expect(email).toMatchObject({ template: 'staff.availability_reopened', to: user.email })
    const reopened = await myAvailability(db, await profileOf(user.id), TODAY)
    expect(reopened).toMatchObject({ confirmedAt: null, resetRequestedAt: null })
    expect(reopened.sessions.map(s => [s.available, s.locked])).toEqual([
      [true, false],
      [true, false],
    ])
    await setAvailability(db, { userId: user.id, sessionId: june.id, available: false }, TODAY)
    await expect(reopenAvailability(db, { userId: user.id, ctx, actor: adminActor }, TODAY)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('starts over when the person leaves the approved staff', async () => {
    const admin = await makeAdmin(db)
    const { user } = await makeStaff(db)
    const actor = { userId: user.id, ip: null }
    const june = await makeSession(db, { title: 'Giugno' })
    await confirmAvailability(db, { userId: user.id, sessionIds: [june.id], actor }, TODAY)
    await requestAvailabilityReset(db, { userId: user.id, actor }, TODAY)
    await changeStaffStatus(db, { userId: user.id, status: 'inactive', actor: { userId: admin.id, ip: null } })
    await expect(
      reopenAvailability(db, { userId: user.id, ctx, actor: { userId: admin.id, ip: null } }, TODAY),
    ).rejects.toMatchObject({ statusCode: 409 })
    await changeStaffStatus(db, { userId: user.id, status: 'approved', actor: { userId: admin.id, ip: null } })
    const back = await myAvailability(db, await profileOf(user.id), TODAY)
    expect(back).toMatchObject({ confirmedAt: null, resetRequestedAt: null })
    expect(back.sessions.every(s => !s.locked)).toBe(true)
  })

  it('is confirmed only by approved staff', async () => {
    const { user } = await makeStaff(db, 'applied')
    await expect(
      confirmAvailability(db, { userId: user.id, sessionIds: [], actor: { userId: user.id, ip: null } }, TODAY),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
