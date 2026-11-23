// The daily limit on outgoing email: at most 100 a day, Italian time. Ordinary emails use the first 80;
// over that they wait in the queue (email_log, status `queued`) and leave by themselves, in order. The
// last 20 are kept for access emails (links, codes), which expire and so never wait. At 23:59 whatever
// is left of the day goes to the queue. A row counts against the limit from the moment it has `sent_at`.
import { randomUUID } from 'node:crypto'
import { and, asc, count, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { EmailDeparture, EmailQueueOverview } from '../../shared/types/communications'
import {
  EMAIL_ACCESS_RESERVE,
  EMAIL_DAILY_LIMIT,
  EMAIL_QUEUE_END_HOUR,
  EMAIL_QUEUE_START_HOUR,
  TIME_ZONE,
  type EmailStatus,
} from '../../shared/utils/constants'
import { addDays, todayIso } from '../../shared/utils/dates'
import { emailLog, users } from '../db/schema'
import type { EmailMessage } from '../emails/types'
import type { Db, DbOrTx, Tx } from './db'

const ORDINARY_LIMIT = EMAIL_DAILY_LIMIT - EMAIL_ACCESS_RESERVE
const QUEUE_ITEMS_SHOWN = 100
const INTERRUPTED_AFTER_MS = 15 * 60 * 1000

const LIMIT_REACHED = `Limite di ${EMAIL_DAILY_LIMIT} email al giorno raggiunto: richiedila di nuovo domani.`
const INTERRUPTED = 'Invio interrotto: l’email potrebbe essere partita, controlla prima di rimandarla.'
const ACCOUNT_DISABLED = 'Account disattivato mentre l’email era in coda: non è partita.'
const WITHDRAWN = 'Ritirata prima di partire: non è stata inviata.'

export interface EmailToSend {
  id: string
  to: string
  template: string
  subject: string
  html: string
  text: string
  sensitive?: boolean
  devNote?: string
}

export interface EmailOutcome {
  id: string
  status: 'sent' | 'failed' | 'simulated' | 'queued'
  providerId?: string
  error?: string
  /** The provider did not answer: the email may have left, so it keeps counting against the limit. */
  uncertain?: boolean
  /** The plain text to keep when the email goes back to the queue. */
  text?: string
}

/**
 * What a provider error means for one email. No status code: the answer was lost and it may have left.
 * A temporary problem (quota, key, outage) puts an ordinary email back in the queue; anything else is a
 * refusal of that email. Access emails expire, so they never go back.
 */
export function providerRefusal(
  item: EmailToSend,
  error: { message: string; statusCode: number | null },
): EmailOutcome {
  const reason = error.message.slice(0, 500)
  if (error.statusCode === null) return { id: item.id, status: 'failed', error: reason, uncertain: true }
  const temporary = [401, 403, 429].includes(error.statusCode) || error.statusCode >= 500
  if (temporary && !item.sensitive) return { id: item.id, status: 'queued', error: reason, text: item.text }
  return { id: item.id, status: 'failed', error: reason }
}

function romeClock(now: Date) {
  const [hour = 0, minute = 0] = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .split(':')
    .map(Number)
  return { hour, minute }
}

const isLastMinute = ({ hour, minute }: { hour: number; minute: number }) => hour === 23 && minute === 59

/** How far the day's count may go for the queue at this moment; 0 while the queue is closed. */
function queueCeiling(now: Date): number {
  const clock = romeClock(now)
  if (isLastMinute(clock)) return EMAIL_DAILY_LIMIT
  return clock.hour >= EMAIL_QUEUE_START_HOUR && clock.hour < EMAIL_QUEUE_END_HOUR ? ORDINARY_LIMIT : 0
}

function dayStart(now: Date) {
  const zone = sql.raw(`'${TIME_ZONE}'`)
  return sql`(date_trunc('day', ${now.toISOString()}::timestamptz at time zone ${zone}) at time zone ${zone})`
}

async function usedToday(db: DbOrTx, now: Date): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(emailLog)
    .where(gte(emailLog.sentAt, dayStart(now)))
  return row?.total ?? 0
}

async function queuedCount(db: DbOrTx): Promise<number> {
  const [row] = await db.select({ total: count() }).from(emailLog).where(eq(emailLog.status, 'queued'))
  return row?.total ?? 0
}

/** One writer at a time on the count, so two sends together cannot pass the limit. */
const lockQuota = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(7310100)`)

/**
 * Decides the fate of new messages and records them: `toSend` have their place in today's limit,
 * the others wait in the queue (behind any email already there), or are refused when they are access
 * emails and the day is full.
 */
export async function claimEmailSlots(db: Db, messages: EmailMessage[], now: Date = new Date()) {
  return db.transaction(async tx => {
    await lockQuota(tx)
    let used = await usedToday(tx, now)
    const lineAhead = (await queuedCount(tx)) > 0
    const plan = messages.map(message => {
      const ceiling = message.sensitive ? EMAIL_DAILY_LIMIT : ORDINARY_LIMIT
      let status: EmailStatus = message.sensitive ? 'failed' : 'queued'
      if (used < ceiling && (message.sensitive || !lineAhead)) {
        used++
        status = 'sending'
      }
      return { id: randomUUID(), message, status }
    })
    await tx.insert(emailLog).values(
      plan.map(({ id, message, status }) => ({
        id,
        template: message.template,
        toEmail: message.to,
        toUserId: message.toUserId ?? null,
        subject: message.subject,
        html: message.sensitive ? null : message.html,
        textBody: status === 'queued' ? message.text : null,
        status,
        error: status === 'failed' ? LIMIT_REACHED : null,
        communicationId: message.communicationId ?? null,
        sessionId: message.sessionId ?? null,
        sentAt: status === 'sending' ? now : null,
      })),
    )
    const toSend: EmailToSend[] = plan
      .filter(item => item.status === 'sending')
      .map(({ id, message }) => ({
        id,
        to: message.to,
        template: message.template,
        subject: message.subject,
        html: message.html,
        text: message.text,
        sensitive: message.sensitive,
        devNote: message.devNote,
      }))
    return {
      toSend,
      queued: plan.filter(item => item.status === 'queued').length,
      refused: plan.filter(item => item.status === 'failed').length,
    }
  })
}

/** Takes the oldest queued emails that fit now. They go to the account's current address. */
export async function claimQueuedEmails(db: Db, now: Date = new Date()): Promise<EmailToSend[]> {
  return db.transaction(async tx => {
    await lockQuota(tx)
    const free = queueCeiling(now) - (await usedToday(tx, now))
    if (free <= 0) return []
    const rows = await tx
      .select({
        id: emailLog.id,
        toEmail: emailLog.toEmail,
        template: emailLog.template,
        subject: emailLog.subject,
        html: emailLog.html,
        text: emailLog.textBody,
        userEmail: users.email,
        userStatus: users.status,
      })
      .from(emailLog)
      .leftJoin(users, eq(users.id, emailLog.toUserId))
      .where(eq(emailLog.status, 'queued'))
      .orderBy(asc(emailLog.createdAt), asc(emailLog.id))
      .limit(free)

    const disabled = rows.filter(row => row.userStatus === 'disabled')
    if (disabled.length) {
      await tx
        .update(emailLog)
        .set({ status: 'withdrawn', error: ACCOUNT_DISABLED, textBody: null })
        .where(
          inArray(
            emailLog.id,
            disabled.map(row => row.id),
          ),
        )
    }
    const leaving = rows.filter(row => row.userStatus !== 'disabled')
    if (leaving.length) {
      await tx
        .update(emailLog)
        .set({
          status: 'sending',
          sentAt: now,
          toEmail: sql`coalesce((select ${users.email} from ${users} where ${users.id} = ${emailLog.toUserId}), ${emailLog.toEmail})`,
        })
        .where(
          inArray(
            emailLog.id,
            leaving.map(row => row.id),
          ),
        )
    }
    return leaving.map(row => ({
      id: row.id,
      to: row.userEmail ?? row.toEmail,
      template: row.template,
      subject: row.subject,
      html: row.html ?? '',
      text: row.text ?? '',
    }))
  })
}

/**
 * Writes how each send went. Only what really left, or may have, keeps its place in the limit: a
 * refused or simulated email gives it back, and one going back to the queue keeps its text.
 */
export async function recordEmailOutcomes(db: Db, outcomes: EmailOutcome[]) {
  if (!outcomes.length) return
  await db.transaction(async tx => {
    for (const { id, status, providerId, error, uncertain, text } of outcomes) {
      await tx
        .update(emailLog)
        .set({
          status,
          providerId: providerId ?? null,
          error: error ?? null,
          textBody: status === 'queued' ? (text ?? null) : null,
          ...(status === 'sent' || uncertain ? {} : { sentAt: null }),
        })
        .where(eq(emailLog.id, id))
    }
  })
}

/** Records messages that could not be claimed, so the log still shows them. */
export async function recordUndelivered(db: Db, messages: EmailMessage[], reason: string) {
  if (!messages.length) return
  await db.insert(emailLog).values(
    messages.map(message => ({
      template: message.template,
      toEmail: message.to,
      toUserId: message.toUserId ?? null,
      subject: message.subject,
      html: message.sensitive ? null : message.html,
      status: 'failed' as const,
      error: reason.slice(0, 500),
      communicationId: message.communicationId ?? null,
      sessionId: message.sessionId ?? null,
    })),
  )
}

/** Whether an access email (link, code) can still leave today. */
export async function canSendAccessEmail(db: DbOrTx, now: Date = new Date()): Promise<boolean> {
  return (await usedToday(db, now)) < EMAIL_DAILY_LIMIT
}

/** Takes back the emails still waiting for this person and session. Returns how many. */
export async function withdrawQueuedEmails(
  db: DbOrTx,
  input: { template: string; toUserId: string; sessionId: string },
): Promise<number> {
  const rows = await db
    .update(emailLog)
    .set({ status: 'withdrawn', error: WITHDRAWN, textBody: null })
    .where(
      and(
        eq(emailLog.status, 'queued'),
        eq(emailLog.template, input.template),
        eq(emailLog.toUserId, input.toUserId),
        eq(emailLog.sessionId, input.sessionId),
      ),
    )
    .returning({ id: emailLog.id })
  return rows.length
}

/** Emails left `sending` by a crash: they may have left, so they stay counted. */
export async function recoverInterruptedEmails(db: Db, now: Date = new Date()) {
  await db
    .update(emailLog)
    .set({ status: 'failed', error: INTERRUPTED, textBody: null })
    .where(and(eq(emailLog.status, 'sending'), lt(emailLog.sentAt, new Date(now.getTime() - INTERRUPTED_AFTER_MS))))
}

/** When a queue of this size is expected to leave, assuming no other email takes a place. */
export function planDepartures(queued: number, used: number, now: Date): (EmailDeparture & { count: number })[] {
  const today = todayIso(now)
  const clock = romeClock(now)
  const plan: (EmailDeparture & { count: number })[] = []
  let left = queued
  let spent = used
  const take = (day: string, time: EmailDeparture['time'], ceiling: number) => {
    const size = Math.min(left, Math.max(0, ceiling - spent))
    if (!size) return
    plan.push({ day, time, count: size })
    left -= size
    spent += size
  }
  if (isLastMinute(clock)) {
    take(today, 'now', EMAIL_DAILY_LIMIT)
  } else {
    if (clock.hour < EMAIL_QUEUE_END_HOUR) {
      take(today, clock.hour < EMAIL_QUEUE_START_HOUR ? '08:00' : 'now', ORDINARY_LIMIT)
    }
    take(today, '23:59', EMAIL_DAILY_LIMIT)
  }
  for (let day = addDays(today, 1); left > 0; day = addDays(day, 1)) {
    spent = 0
    take(day, '08:00', ORDINARY_LIMIT)
    take(day, '23:59', EMAIL_DAILY_LIMIT)
  }
  return plan
}

/** Today's count against the limit, the expected departures and the first of the queue. */
export async function getEmailQueue(db: Db, now: Date = new Date()): Promise<EmailQueueOverview> {
  const [used, queued, rows] = await Promise.all([
    usedToday(db, now),
    queuedCount(db),
    db
      .select({
        id: emailLog.id,
        toEmail: emailLog.toEmail,
        firstName: users.firstName,
        lastName: users.lastName,
        subject: emailLog.subject,
        template: emailLog.template,
        createdAt: emailLog.createdAt,
      })
      .from(emailLog)
      .leftJoin(users, eq(users.id, emailLog.toUserId))
      .where(eq(emailLog.status, 'queued'))
      .orderBy(asc(emailLog.createdAt), asc(emailLog.id))
      .limit(QUEUE_ITEMS_SHOWN),
  ])
  const departures = planDepartures(queued, used, now)
  const slots = departures.flatMap(({ day, time, count: size }) =>
    Array.from({ length: Math.min(size, QUEUE_ITEMS_SHOWN) }, () => ({ day, time })),
  )
  return {
    used,
    limit: EMAIL_DAILY_LIMIT,
    reserve: EMAIL_ACCESS_RESERVE,
    ordinaryLeft: queued ? 0 : Math.max(0, ORDINARY_LIMIT - used),
    queued,
    departures,
    items: rows.flatMap(({ firstName, lastName, createdAt, ...row }, index) => {
      const departure = slots[index]
      if (!departure) return []
      return [
        {
          ...row,
          position: index + 1,
          toName: [firstName, lastName].filter(Boolean).join(' ') || null,
          createdAt: createdAt.toISOString(),
          departure,
        },
      ]
    }),
  }
}
