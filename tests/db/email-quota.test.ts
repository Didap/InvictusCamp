import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  claimEmailSlots,
  claimQueuedEmails,
  getEmailQueue,
  planDepartures,
  recordEmailOutcomes,
  recoverInterruptedEmails,
} from '../../server/domain/email-quota'
import type { EmailMessage } from '../../server/emails/types'
import { makeUser, t, useTestDb } from './helpers'

const db = useTestDb()

const MONDAY_10 = new Date('2026-11-23T10:00:00+01:00')
const MONDAY_21 = new Date('2026-11-23T21:00:00+01:00')
const MONDAY_2359 = new Date('2026-11-23T23:59:10+01:00')
const TUESDAY_07 = new Date('2026-11-24T07:00:00+01:00')
const TUESDAY_09 = new Date('2026-11-24T09:00:00+01:00')

function messages(size: number, extra: Partial<EmailMessage> = {}): EmailMessage[] {
  return Array.from({ length: size }, (_, index) => ({
    to: `persona${index}@example.test`,
    template: 'communication',
    subject: `Messaggio ${index}`,
    html: '<p>Ciao</p>',
    text: 'Ciao',
    ...extra,
  }))
}

const statusCount = async (status: 'queued' | 'sending' | 'failed') =>
  (await db.select().from(t.emailLog).where(eq(t.emailLog.status, status))).length

describe('daily email limit', () => {
  it('sends the first 80 ordinary emails and queues the rest with their content', async () => {
    const claim = await claimEmailSlots(db, messages(95), MONDAY_10)
    expect(claim).toMatchObject({ queued: 15, refused: 0 })
    expect(claim.toSend).toHaveLength(80)
    const [queued] = await db.select().from(t.emailLog).where(eq(t.emailLog.status, 'queued')).limit(1)
    expect(queued).toMatchObject({ html: '<p>Ciao</p>', textBody: 'Ciao', sentAt: null })
  })

  it('keeps the last 20 for access emails, never queues them and never passes 100', async () => {
    await claimEmailSlots(db, messages(80), MONDAY_10)
    const access = await claimEmailSlots(db, messages(25, { sensitive: true }), MONDAY_10)
    expect(access).toMatchObject({ queued: 0, refused: 5 })
    expect(access.toSend).toHaveLength(20)
    expect((await getEmailQueue(db, MONDAY_10)).used).toBe(100)
    const stored = await db.select().from(t.emailLog).where(eq(t.emailLog.template, 'communication'))
    expect(stored.filter(row => row.html === null)).toHaveLength(25)
  })

  it('lets access emails pass a waiting queue, while ordinary ones line up behind it', async () => {
    await claimEmailSlots(db, messages(85), MONDAY_10)
    const access = await claimEmailSlots(db, messages(1, { sensitive: true }), TUESDAY_07)
    expect(access.toSend).toHaveLength(1)
    const ordinary = await claimEmailSlots(db, messages(1), TUESDAY_07)
    expect(ordinary).toMatchObject({ toSend: [], queued: 1 })
  })

  it('does not pass the limit when sends run together', async () => {
    await Promise.all(Array.from({ length: 6 }, () => claimEmailSlots(db, messages(30), MONDAY_10)))
    expect((await getEmailQueue(db, MONDAY_10)).used).toBe(80)
    expect(await statusCount('queued')).toBe(100)
  })

  it('at 23:59 spends what is left of the day on the queue, up to 100', async () => {
    await claimEmailSlots(db, messages(110), MONDAY_10)
    expect(await claimQueuedEmails(db, MONDAY_21)).toHaveLength(0)
    expect(await claimQueuedEmails(db, MONDAY_2359)).toHaveLength(20)
    expect((await getEmailQueue(db, MONDAY_2359)).used).toBe(100)
    expect(await claimQueuedEmails(db, MONDAY_2359)).toHaveLength(0)
    expect(await statusCount('queued')).toBe(10)
  })

  it('starts again the next day from 8:00', async () => {
    await claimEmailSlots(db, messages(170), MONDAY_10)
    expect(await claimQueuedEmails(db, TUESDAY_07)).toHaveLength(0)
    expect(await claimQueuedEmails(db, TUESDAY_09)).toHaveLength(80)
    expect(await statusCount('queued')).toBe(10)
  })

  it('uses the current address and skips disabled accounts', async () => {
    const moved = await makeUser(db, { email: 'nuovo@example.test' })
    const disabled = await makeUser(db, { email: 'via@example.test', status: 'disabled' })
    await claimEmailSlots(db, messages(80), MONDAY_10)
    await claimEmailSlots(
      db,
      [
        { ...messages(1)[0]!, to: 'vecchio@example.test', toUserId: moved.id },
        { ...messages(1)[0]!, to: 'via@example.test', toUserId: disabled.id },
      ],
      MONDAY_10,
    )
    const leaving = await claimQueuedEmails(db, TUESDAY_09)
    expect(leaving.map(item => item.to)).toEqual(['nuovo@example.test'])
    expect(await statusCount('failed')).toBe(1)
  })

  it('gives back the place of a refused email and keeps the one of an uncertain send', async () => {
    const { toSend } = await claimEmailSlots(db, messages(2), MONDAY_10)
    await recordEmailOutcomes(db, [
      { id: toSend[0]!.id, status: 'failed', error: 'indirizzo rifiutato' },
      { id: toSend[1]!.id, status: 'failed', error: 'timeout', uncertain: true },
    ])
    expect((await getEmailQueue(db, MONDAY_10)).used).toBe(1)
  })

  it('closes a send interrupted by a crash and keeps it counted', async () => {
    await claimEmailSlots(db, messages(1), MONDAY_10)
    await recoverInterruptedEmails(db, new Date(MONDAY_10.getTime() + 20 * 60 * 1000))
    expect(await statusCount('failed')).toBe(1)
    expect((await getEmailQueue(db, MONDAY_10)).used).toBe(1)
  })

  it('shows the queue in order with the expected departure', async () => {
    await claimEmailSlots(db, messages(105), MONDAY_10)
    const queue = await getEmailQueue(db, MONDAY_10)
    expect(queue).toMatchObject({ used: 80, ordinaryLeft: 0, queued: 25 })
    expect(queue.departures).toEqual([
      { day: '2026-11-23', time: '23:59', count: 20 },
      { day: '2026-11-24', time: '08:00', count: 5 },
    ])
    expect(queue.items[0]).toMatchObject({ position: 1, departure: { day: '2026-11-23', time: '23:59' } })
    expect(queue.items[24]).toMatchObject({ position: 25, departure: { day: '2026-11-24', time: '08:00' } })
  })
})

describe('planDepartures', () => {
  it('spreads a long queue over the days, 80 in the morning and 20 at 23:59', () => {
    expect(planDepartures(230, 100, MONDAY_10)).toEqual([
      { day: '2026-11-24', time: '08:00', count: 80 },
      { day: '2026-11-24', time: '23:59', count: 20 },
      { day: '2026-11-25', time: '08:00', count: 80 },
      { day: '2026-11-25', time: '23:59', count: 20 },
      { day: '2026-11-26', time: '08:00', count: 30 },
    ])
  })

  it('after 20:00 only the 23:59 round is left today', () => {
    expect(planDepartures(10, 40, MONDAY_21)).toEqual([{ day: '2026-11-23', time: '23:59', count: 10 }])
  })
})
