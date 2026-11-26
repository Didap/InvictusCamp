// The daily limit on outgoing email: at most 100 a day, the quota of Resend's free plan. Resend counts a
// UTC day, so the count restarts at 01:00 Italian time (02:00 in summer). Ordinary emails use the first
// 80; over that they wait in the queue (email_log, status `queued`) and leave by themselves, in order.
// The last 20 are kept for access emails (links, codes), which expire and so never wait. At 23:59 Italian
// time whatever is left goes to the queue. A row counts against the limit from the moment it has `sent_at`.
import { randomUUID } from 'node:crypto'
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { EmailDeparture, EmailQueueOverview, EmailQuotaSummary } from '../../shared/types/communications'
import {
  EMAIL_DAILY_LIMIT,
  EMAIL_ORDINARY_LIMIT,
  EMAIL_QUEUE_END_HOUR,
  EMAIL_QUEUE_START_HOUR,
  TIME_ZONE,
  type EmailStatus,
} from '../../shared/utils/constants'
import { addDays, todayIso } from '../../shared/utils/dates'
import { fullName } from '../../shared/utils/format'
import { emailLog, users } from '../db/schema'
import type { EmailMessage } from '../emails/types'
import type { Db, DbOrTx, Tx } from './db'

const QUEUE_ITEMS_SHOWN = 100
const QUEUE_ORDER = [asc(emailLog.createdAt), asc(emailLog.id)]
const INTERRUPTED_AFTER_MS = 15 * 60 * 1000

const INTERRUPTED = 'Invio interrotto: l’email potrebbe essere partita, controlla prima di rimandarla.'
const ACCOUNT_DISABLED = 'Account disattivato mentre l’email era in coda: non è partita.'
const WITHDRAWN = 'Ritirata prima di partire: non è stata inviata.'

export type EmailToSend = EmailMessage & { id: string }

export interface EmailOutcome {
  id: string
  status: 'sent' | 'failed' | 'simulated' | 'queued'
  providerId?: string
  error?: string
  /** The provider did not answer: the email may have left, so it keeps counting against the limit. */
  uncertain?: boolean
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
  const { id } = item
  if (error.statusCode === null) return { id, status: 'failed', error: error.message, uncertain: true }
  const temporary = [401, 403, 429].includes(error.statusCode) || error.statusCode >= 500
  return { id, status: temporary && !item.sensitive ? 'queued' : 'failed', error: error.message }
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
  return clock.hour >= EMAIL_QUEUE_START_HOUR && clock.hour < EMAIL_QUEUE_END_HOUR ? EMAIL_ORDINARY_LIMIT : 0
}

/** The start of Resend's quota day, which is a UTC calendar day. */
function quotaDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** When the count restarts, in Italian time: "01:00", or "02:00" in summer. */
export function emailQuotaResetTime(now: Date = new Date()): string {
  const nextDay = new Date(quotaDayStart(now).getTime() + 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('it-IT', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(nextDay)
}

async function usedToday(db: DbOrTx, now: Date): Promise<number> {
  return db.$count(emailLog, gte(emailLog.sentAt, quotaDayStart(now)))
}

export async function queuedCount(db: DbOrTx): Promise<number> {
  return db.$count(emailLog, eq(emailLog.status, 'queued'))
}

/** Whether a round of the queue has anything to do. */
export async function hasQueueWork(db: DbOrTx): Promise<boolean> {
  const [row] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(inArray(emailLog.status, ['queued', 'sending']))
    .limit(1)
  return Boolean(row)
}

/** One writer at a time on the count, so two sends together cannot pass the limit. */
const lockQuota = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(7310100)`)

/** The columns of a log row that come straight from the message. Access emails keep no content. */
/** Why an email whose automatic email is off did not leave. */
export const EMAIL_OFF = 'Non inviata: l’email automatica è spenta in Comunicazioni › Automatiche.'

const logColumns = (message: EmailMessage) => ({
  template: message.template,
  toEmail: message.to,
  toUserId: message.toUserId ?? null,
  subject: message.subject,
  html: message.sensitive ? null : message.html,
  communicationId: message.communicationId ?? null,
  sessionId: message.sessionId ?? null,
})

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
      const ceiling = message.sensitive ? EMAIL_DAILY_LIMIT : EMAIL_ORDINARY_LIMIT
      let status: EmailStatus = message.sensitive ? 'failed' : 'queued'
      if (used < ceiling && (message.sensitive || !lineAhead)) {
        used++
        status = 'sending'
      }
      return { id: randomUUID(), message, status }
    })
    await tx.insert(emailLog).values(
      plan.map(({ id, message, status }) => ({
        ...logColumns(message),
        id,
        textBody: message.sensitive ? null : message.text,
        status,
        error:
          status === 'failed'
            ? `Limite di ${EMAIL_DAILY_LIMIT} email al giorno raggiunto: il conteggio riparte alle ${emailQuotaResetTime(now)}.`
            : null,
        sentAt: status === 'sending' ? now : null,
      })),
    )
    const toSend: EmailToSend[] = plan
      .filter(item => item.status === 'sending')
      .map(({ id, message }) => ({ ...message, id }))
    return {
      toSend,
      queued: plan.filter(item => item.status === 'queued').length,
      refused: plan.filter(item => item.status === 'failed').length,
    }
  })
}

/** Takes the oldest queued emails that fit now. They go to the account's current address. */
export async function claimQueuedEmails(db: Db, now: Date = new Date()): Promise<EmailToSend[]> {
  const ceiling = queueCeiling(now)
  if (!ceiling) return []
  return db.transaction(async tx => {
    await lockQuota(tx)
    const free = ceiling - (await usedToday(tx, now))
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
      .orderBy(...QUEUE_ORDER)
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
    for (const { id, status, providerId, error, uncertain } of outcomes) {
      await tx
        .update(emailLog)
        .set({
          status,
          providerId: providerId ?? null,
          error: error?.slice(0, 500) ?? null,
          ...(status === 'queued' ? {} : { textBody: null }),
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
      ...logColumns(message),
      status: 'failed' as const,
      error: reason.slice(0, 500),
    })),
  )
}

/** Records the emails whose automatic email is switched off: they never leave and never count. */
export async function recordDisabled(db: Db, messages: EmailMessage[]) {
  if (!messages.length) return
  await db
    .insert(emailLog)
    .values(messages.map(message => ({ ...logColumns(message), status: 'disabled' as const, error: EMAIL_OFF })))
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
export function planDepartures(queued: number, used: number, now: Date): EmailQuotaSummary['departures'] {
  const today = todayIso(now)
  const clock = romeClock(now)
  const plan: EmailQuotaSummary['departures'] = []
  let left = queued
  // Just after midnight Resend is still on yesterday's day: today's places are all free.
  let spent = today === now.toISOString().slice(0, 10) ? used : 0
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
      take(today, clock.hour < EMAIL_QUEUE_START_HOUR ? 'opening' : 'now', EMAIL_ORDINARY_LIMIT)
    }
    take(today, 'last', EMAIL_DAILY_LIMIT)
  }
  for (let day = addDays(today, 1); left > 0; day = addDays(day, 1)) {
    spent = 0
    take(day, 'opening', EMAIL_ORDINARY_LIMIT)
    take(day, 'last', EMAIL_DAILY_LIMIT)
  }
  return plan
}

/** Today's count against the limit and the expected departures. */
export async function getEmailQuota(db: Db, now: Date = new Date()): Promise<EmailQuotaSummary> {
  const [used, queued] = await Promise.all([usedToday(db, now), queuedCount(db)])
  return {
    used,
    ordinaryLeft: queued ? 0 : Math.max(0, EMAIL_ORDINARY_LIMIT - used),
    queued,
    departures: planDepartures(queued, used, now),
    resetTime: emailQuotaResetTime(now),
  }
}

function departureOf(departures: EmailQuotaSummary['departures'], index: number): EmailDeparture | undefined {
  let left = index
  for (const { day, time, count } of departures) {
    if (left < count) return { day, time }
    left -= count
  }
}

/** The summary and the first of the queue, each with its expected departure. */
export async function getEmailQueue(db: Db, now: Date = new Date()): Promise<EmailQueueOverview> {
  const [quota, rows] = await Promise.all([
    getEmailQuota(db, now),
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
      .orderBy(...QUEUE_ORDER)
      .limit(QUEUE_ITEMS_SHOWN),
  ])
  return {
    ...quota,
    items: rows.flatMap(({ firstName, lastName, createdAt, ...row }, index) => {
      const departure = departureOf(quota.departures, index)
      if (!departure) return []
      return [
        {
          ...row,
          toName: fullName({ firstName, lastName }) || null,
          createdAt: createdAt.toISOString(),
          departure,
        },
      ]
    }),
  }
}
