// The availability of the staff against a real database (docs/spec.md 3.5): answers saved one by one, fixed by
// «Conferma le preferenze» for the sessions that existed then, reopened only by the administration after «Chiedi il
// reset». A session created later can still be answered and confirmed.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
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
const minutes = (n: number) => new Date(Date.now() + n * 60_000)

const profileOf = async (userId: string) =>
  (await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.userId, userId)))[0]!

describe('staff availability', () => {
  it('is fixed once confirmed, open again for a session created later, reopened by the administration', async () => {
    const admin = await makeAdmin(db)
    const { user } = await makeStaff(db)
    const actor = { userId: user.id, ip: null }
    const june = await makeSession(db, { title: 'Giugno', createdAt: minutes(-60) })
    const july = await makeSession(db, {
      title: 'Luglio',
      startDate: '2027-07-05',
      endDate: '2027-07-11',
      createdAt: minutes(-60),
    })
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

    const confirmed = await confirmAvailability(db, { userId: user.id, actor }, TODAY)
    expect(confirmed.confirmedAt).not.toBeNull()
    expect(confirmed.sessions.map(s => [s.title, s.available, s.locked])).toEqual([
      ['Giugno', true, true],
      ['Luglio', false, true],
    ])
    await expect(
      setAvailability(db, { userId: user.id, sessionId: july.id, available: true }, TODAY),
    ).rejects.toMatchObject({ statusCode: 409 })
    const [audit] = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'staff.availability_confirm'))
    expect(audit!.data).toEqual({ available: [june.id] })

    // A session created after the confirmation: open, and confirmed in turn.
    const august = await makeSession(db, {
      title: 'Agosto',
      startDate: '2027-08-02',
      endDate: '2027-08-08',
      createdAt: minutes(60),
    })
    await setAvailability(db, { userId: user.id, sessionId: august.id, available: true }, TODAY)
    const withNew = await myAvailability(db, await profileOf(user.id), TODAY)
    expect(withNew.sessions.find(s => s.id === august.id)).toMatchObject({ available: true, locked: false })
    expect((await staffHome(db, await profileOf(user.id), TODAY)).availability.toConfirm).toBe(1)

    // «Chiedi il reset», once; the administration reopens and the person hears it by email.
    const asked = await requestAvailabilityReset(db, { userId: user.id, actor }, TODAY)
    expect(asked.resetRequestedAt).not.toBeNull()
    expect((await requestAvailabilityReset(db, { userId: user.id, actor }, TODAY)).resetRequestedAt).toBe(
      asked.resetRequestedAt,
    )
    const [email] = await reopenAvailability(db, { userId: user.id, ctx, actor: { userId: admin.id, ip: null } })
    expect(email).toMatchObject({ template: 'staff.availability_reopened', to: user.email })
    const reopened = await myAvailability(db, await profileOf(user.id), TODAY)
    expect(reopened).toMatchObject({ confirmedAt: null, resetRequestedAt: null })
    expect(reopened.sessions.every(s => !s.locked)).toBe(true)
    expect(reopened.sessions.filter(s => s.available).map(s => s.title)).toEqual(['Giugno', 'Agosto'])
    await setAvailability(db, { userId: user.id, sessionId: july.id, available: true }, TODAY)
    await expect(
      reopenAvailability(db, { userId: user.id, ctx, actor: { userId: admin.id, ip: null } }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('is confirmed only by approved staff', async () => {
    const { user } = await makeStaff(db, 'applied')
    await expect(
      confirmAvailability(db, { userId: user.id, actor: { userId: user.id, ip: null } }, TODAY),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
