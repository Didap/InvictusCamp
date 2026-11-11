// Audiences and the communications sent to them (docs/spec.md, 3.7). An audience resolves to the
// accounts that can receive email: active, with a confirmed address, each person once. Disabled
// accounts never receive anything; the others that match are counted as excluded, so the composer
// can say so. Sending records a `communications` row and returns one email per recipient: the
// handler delivers them after the commit, and deliver() writes the email log.
import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { audienceSessionId, describeAudience } from '../../shared/schemas/communications'
import type { Paginated } from '../../shared/types/api'
import type { CommunicationDetail, CommunicationListItem } from '../../shared/types/communications'
import type { Audience } from '../../shared/types/domain'
import { EMAIL_STATUSES, type EmailStatus, type UserRole, type UserStatus } from '../../shared/utils/constants'
import { fillMessageFields, messageFieldValues } from '../../shared/utils/message-fields'
import {
  campSessions,
  communications,
  emailLog,
  families,
  sessionFamilies,
  sessionStaff,
  staffProfiles,
  users,
} from '../db/schema'
import { communicationEmail } from '../emails/communications'
import type { EmailContext, EmailMessage } from '../emails/types'
import type { DbOrTx } from './db'
import { httpError } from './users'

export interface Recipient {
  userId: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
}

export interface ResolvedAudience {
  recipients: Recipient[]
  /** Accounts that match the audience but cannot receive email. */
  excluded: number
}

interface Candidate extends Recipient {
  status: UserStatus
  emailVerifiedAt: Date | null
}

const candidateColumns = {
  userId: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  role: users.role,
  status: users.status,
  emailVerifiedAt: users.emailVerifiedAt,
}

/** Only active accounts with a confirmed address receive messages from the dashboard. */
export function canReceive(user: { status: UserStatus; emailVerifiedAt: Date | null }): boolean {
  return user.status === 'active' && user.emailVerifiedAt !== null
}

async function requireSession(db: DbOrTx, sessionId: string) {
  const [session] = await db
    .select({ id: campSessions.id, title: campSessions.title })
    .from(campSessions)
    .where(eq(campSessions.id, sessionId))
    .limit(1)
  if (!session) throw httpError(404, 'Sessione non trovata')
  return session
}

async function candidates(db: DbOrTx, audience: Audience): Promise<Candidate[]> {
  switch (audience.type) {
    case 'all_families':
      return db.select(candidateColumns).from(users).where(eq(users.role, 'family'))
    case 'all_staff':
    case 'staff_candidates':
      return db
        .select(candidateColumns)
        .from(users)
        .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
        .where(
          and(
            eq(users.role, 'staff'),
            eq(staffProfiles.status, audience.type === 'all_staff' ? 'approved' : 'applied'),
          ),
        )
    case 'session_families': {
      await requireSession(db, audience.sessionId)
      if (audience.kinds?.length === 0 || audience.statuses?.length === 0) return []
      return db
        .select(candidateColumns)
        .from(sessionFamilies)
        .innerJoin(families, eq(families.id, sessionFamilies.familyId))
        .innerJoin(users, eq(users.id, families.userId))
        .where(
          and(
            eq(sessionFamilies.sessionId, audience.sessionId),
            audience.kinds ? inArray(sessionFamilies.kind, audience.kinds) : undefined,
            audience.statuses ? inArray(sessionFamilies.status, audience.statuses) : undefined,
          ),
        )
    }
    case 'session_staff': {
      await requireSession(db, audience.sessionId)
      if (audience.statuses?.length === 0) return []
      return db
        .select(candidateColumns)
        .from(sessionStaff)
        .innerJoin(users, eq(users.id, sessionStaff.userId))
        .where(
          and(
            eq(sessionStaff.sessionId, audience.sessionId),
            audience.statuses ? inArray(sessionStaff.status, audience.statuses) : undefined,
          ),
        )
    }
    case 'users': {
      const ids = [...new Set(audience.userIds)]
      if (!ids.length) return []
      return db.select(candidateColumns).from(users).where(inArray(users.id, ids))
    }
  }
}

/** The people an audience reaches, by surname, each once. */
export async function resolveAudience(db: DbOrTx, audience: Audience): Promise<ResolvedAudience> {
  const seen = new Set<string>()
  const recipients: Recipient[] = []
  let excluded = 0
  for (const candidate of await candidates(db, audience)) {
    if (seen.has(candidate.userId)) continue
    seen.add(candidate.userId)
    if (!canReceive(candidate)) {
      excluded++
      continue
    }
    const { userId, email, firstName, lastName, role } = candidate
    recipients.push({ userId, email, firstName, lastName, role })
  }
  recipients.sort(
    (a, b) =>
      a.lastName.localeCompare(b.lastName, 'it', { sensitivity: 'base' }) ||
      a.firstName.localeCompare(b.firstName, 'it', { sensitivity: 'base' }) ||
      a.email.localeCompare(b.email),
  )
  return { recipients, excluded }
}

/** The title of the session an audience belongs to (for its description). */
export async function audienceSessionTitle(db: DbOrTx, audience: Audience): Promise<string | null> {
  const sessionId = audienceSessionId(audience)
  return sessionId ? ((await sessionForFields(db, sessionId))?.title ?? null) : null
}

/** What {sessione} and {date} need: the title and the days of the session. */
export async function sessionForFields(db: DbOrTx, sessionId: string) {
  const [session] = await db
    .select({ title: campSessions.title, startDate: campSessions.startDate, endDate: campSessions.endDate })
    .from(campSessions)
    .where(eq(campSessions.id, sessionId))
    .limit(1)
  return session ?? null
}

export interface CommunicationContent {
  subject: string
  body: string
  audience: Audience
}

/** Saves a message without sending it (sentAt stays null). */
export async function saveDraft(db: DbOrTx, input: CommunicationContent & { authorId: string }): Promise<string> {
  const [row] = await db
    .insert(communications)
    .values({
      subject: input.subject,
      body: input.body,
      audience: input.audience,
      sessionId: audienceSessionId(input.audience),
      sentBy: input.authorId,
    })
    .returning({ id: communications.id })
  return row!.id
}

const notFound = () => httpError(404, 'Comunicazione non trovata')

/** Why a draft could not be changed: it was sent already, or it is not there. */
async function draftError(db: DbOrTx, id: string) {
  const [row] = await db
    .select({ id: communications.id })
    .from(communications)
    .where(eq(communications.id, id))
    .limit(1)
  return row ? httpError(409, 'Questa comunicazione è già stata inviata: non si può più modificare') : notFound()
}

/** Updates a draft; a message already sent cannot change. */
export async function updateDraft(
  db: DbOrTx,
  id: string,
  input: CommunicationContent & { authorId: string },
): Promise<void> {
  const [row] = await db
    .update(communications)
    .set({
      subject: input.subject,
      body: input.body,
      audience: input.audience,
      sessionId: audienceSessionId(input.audience),
      sentBy: input.authorId,
    })
    .where(and(eq(communications.id, id), isNull(communications.sentAt)))
    .returning({ id: communications.id })
  if (!row) throw await draftError(db, id)
}

/** Deletes a draft. */
export async function deleteDraft(db: DbOrTx, id: string): Promise<void> {
  const [row] = await db
    .delete(communications)
    .where(and(eq(communications.id, id), isNull(communications.sentAt)))
    .returning({ id: communications.id })
  if (!row) throw await draftError(db, id)
}

export interface SendCommunicationInput extends CommunicationContent {
  sentBy: string
  /** Send this draft (its content is replaced by the input). */
  draftId?: string
}

/**
 * Records the communication as sent and returns its emails, one per recipient. Refused when the
 * audience reaches nobody, and when the draft was sent already (two clicks never send twice).
 */
export async function sendCommunication(
  db: DbOrTx,
  ctx: EmailContext,
  input: SendCommunicationInput,
  now = new Date(),
): Promise<{ communicationId: string; recipients: Recipient[]; messages: EmailMessage[] }> {
  const { recipients } = await resolveAudience(db, input.audience)
  if (!recipients.length) {
    throw httpError(400, 'Nessun destinatario: nessun account attivo corrisponde alla scelta')
  }
  const sessionId = audienceSessionId(input.audience)
  const values = {
    subject: input.subject,
    body: input.body,
    audience: input.audience,
    sessionId,
    recipientCount: recipients.length,
    sentBy: input.sentBy,
    sentAt: now,
  }
  let communicationId: string
  if (input.draftId) {
    const [row] = await db
      .update(communications)
      .set(values)
      .where(and(eq(communications.id, input.draftId), isNull(communications.sentAt)))
      .returning({ id: communications.id })
    if (!row) throw await draftError(db, input.draftId)
    communicationId = row.id
  } else {
    const [row] = await db.insert(communications).values(values).returning({ id: communications.id })
    communicationId = row!.id
  }
  const session = sessionId ? await sessionForFields(db, sessionId) : null
  const messages = recipients.map(recipient => {
    const values = messageFieldValues(recipient.firstName, session)
    return communicationEmail(ctx, {
      to: recipient.email,
      toUserId: recipient.userId,
      subject: fillMessageFields(input.subject, values),
      body: fillMessageFields(input.body, values),
      communicationId,
      sessionId,
    })
  })
  return { communicationId, recipients, messages }
}

// ─── Reading ───────────────────────────────────────────────────────────────────────────────────────

const listColumns = {
  id: communications.id,
  subject: communications.subject,
  audience: communications.audience,
  recipientCount: communications.recipientCount,
  sessionId: communications.sessionId,
  sessionTitle: campSessions.title,
  sentByFirstName: users.firstName,
  sentByLastName: users.lastName,
  sentAt: communications.sentAt,
  createdAt: communications.createdAt,
}

interface ListRow {
  id: string
  subject: string
  audience: Audience
  recipientCount: number
  sessionId: string | null
  sessionTitle: string | null
  sentByFirstName: string | null
  sentByLastName: string | null
  sentAt: Date | null
  createdAt: Date
}

function toListItem(row: ListRow): CommunicationListItem {
  return {
    id: row.id,
    subject: row.subject,
    audience: row.audience,
    audienceLabel: describeAudience(row.audience, row.sessionTitle),
    recipientCount: row.recipientCount,
    sessionId: row.sessionId,
    sessionTitle: row.sessionTitle,
    sentByName: row.sentByFirstName ? `${row.sentByFirstName} ${row.sentByLastName ?? ''}`.trim() : null,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

function selectCommunications(db: DbOrTx) {
  return db
    .select({ ...listColumns, body: communications.body })
    .from(communications)
    .leftJoin(campSessions, eq(campSessions.id, communications.sessionId))
    .leftJoin(users, eq(users.id, communications.sentBy))
}

/** Messages, drafts first, then the most recent; optionally those of one session. */
export async function listCommunications(
  db: DbOrTx,
  query: { sessionId?: string; page: number; pageSize: number },
): Promise<Paginated<CommunicationListItem>> {
  const where: SQL | undefined = query.sessionId ? eq(communications.sessionId, query.sessionId) : undefined
  const [rows, [totals]] = await Promise.all([
    selectCommunications(db)
      .where(where)
      .orderBy(
        sql`${communications.sentAt} is not null`,
        desc(sql`coalesce(${communications.sentAt}, ${communications.createdAt})`),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(communications).where(where),
  ])
  return { items: rows.map(toListItem), total: totals?.total ?? 0, page: query.page, pageSize: query.pageSize }
}

/** One message with its emails and how they were delivered. */
export async function getCommunication(db: DbOrTx, id: string): Promise<CommunicationDetail> {
  const [row] = await selectCommunications(db).where(eq(communications.id, id)).limit(1)
  if (!row) throw notFound()
  const recipients = await db
    .select({
      emailId: emailLog.id,
      userId: emailLog.toUserId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: emailLog.toEmail,
      status: emailLog.status,
      error: emailLog.error,
      createdAt: emailLog.createdAt,
    })
    .from(emailLog)
    .leftJoin(users, eq(users.id, emailLog.toUserId))
    .where(eq(emailLog.communicationId, id))
    .orderBy(asc(users.lastName), asc(users.firstName), asc(emailLog.toEmail))
  const delivery = Object.fromEntries(EMAIL_STATUSES.map(status => [status, 0])) as Record<EmailStatus, number>
  for (const recipient of recipients) delivery[recipient.status]++
  return {
    ...toListItem(row),
    body: row.body,
    delivery,
    recipients: recipients.map(r => ({
      emailId: r.emailId,
      userId: r.userId,
      name: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
      email: r.email,
      status: r.status,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}
