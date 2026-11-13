// Sessions, places and reserves (docs/spec.md 3.2 and 3.3). Every function that changes something
// takes the database or a transaction, applies the rules of the spec, writes the audit and returns
// the emails to send; handlers run it in useDb().transaction() and call deliver() after the commit.
// Explicit imports only, so the database tests can load this file (tests/db/sessions.test.ts).
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import type { SessionInput } from '../../shared/schemas/sessions'
import { countsTowardNeeded } from '../../shared/schemas/staff'
import type {
  ContractOption,
  FamilyParticipationItem,
  FamilySessionItem,
  SessionCandidate,
  SessionDetail,
  SessionFamiliesDto,
  SessionFamilyItem,
  SessionListItem,
  SessionMove,
  SlotCounts,
  StaffCounts,
} from '../../shared/types/sessions'
import {
  OPEN_CONVOCATIONS,
  enumLabel,
  type ParticipationKind,
  type ParticipationStatus,
  type SessionStatus,
  type UserStatus,
} from '../../shared/utils/constants'
import { todayIso } from '../../shared/utils/dates'
import { formatDateTime, plural } from '../../shared/utils/format'
import {
  SESSION_TRANSITIONS,
  SESSION_TRANSITION_ACTIONS,
  SESSION_TRANSITION_EFFECTS,
  canTransition,
  isSessionEditable,
  isSessionOpen,
} from '../../shared/utils/session-status'
import {
  ACTIVE_STATUSES,
  freeSlots,
  isWaitingReserve,
  nextReserve,
  nextReserveRank,
  slotSummary,
  waitingReserves,
} from '../../shared/utils/slots'
import {
  campSessions,
  holdsPlace,
  documents,
  families,
  feedbackResponses,
  sessionFamilies,
  sessionStaff,
  signatureRequests,
  staffProfiles,
  users,
} from '../db/schema'
import {
  sessionCancelledEmail,
  sessionConfirmedEmail,
  sessionFeedbackEmail,
  sessionInviteEmail,
  sessionRemovedEmail,
  sessionReserveEmail,
  sessionSlotOfferedEmail,
  type SessionEmailFacts,
  type SessionEmailTemplate,
} from '../emails/sessions'
import type { EmailContext, EmailMessage } from '../emails/types'
import { writeAudit } from './audit'
import { sessionCsv } from './csv'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import { isYearArchived, ownResponse, questionnaireOpen } from './feedback'
import { freezeSessionProgramme } from './programmes'
import { cancelSessionConvocations, sessionConvocationNotices } from './staff'

/** Who acts: the signed-in user and the client address, for the audit. */
export interface Actor {
  userId: string | null
  ip?: string | null
}

type SessionRow = typeof campSessions.$inferSelect

const STATUS_ORDER: Record<ParticipationStatus, number> = {
  confirmed: 0,
  invited: 1,
  selected: 2,
  declined: 3,
  cancelled: 4,
}

// ─── Reading ───────────────────────────────────────────────────────────────────────────────────────

/** A participation with the family and its account (never the health details of its members). */
interface ParticipationRow {
  id: string
  sessionId: string
  familyId: string
  kind: ParticipationKind
  status: ParticipationStatus
  reserveRank: number | null
  invitedAt: Date | null
  respondedAt: Date | null
  declineReason: string | null
  createdAt: Date
  familyName: string
  city: string | null
  familyPhone: string | null
  userId: string
  email: string
  firstName: string
  lastName: string
  userPhone: string | null
  userStatus: UserStatus
}

function participationsOf(db: DbOrTx, sessionId: string): Promise<ParticipationRow[]> {
  return db
    .select({
      id: sessionFamilies.id,
      sessionId: sessionFamilies.sessionId,
      familyId: sessionFamilies.familyId,
      kind: sessionFamilies.kind,
      status: sessionFamilies.status,
      reserveRank: sessionFamilies.reserveRank,
      invitedAt: sessionFamilies.invitedAt,
      respondedAt: sessionFamilies.respondedAt,
      declineReason: sessionFamilies.declineReason,
      createdAt: sessionFamilies.createdAt,
      familyName: families.name,
      city: families.city,
      familyPhone: families.phone,
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      userPhone: users.phone,
      userStatus: users.status,
    })
    .from(sessionFamilies)
    .innerJoin(families, eq(families.id, sessionFamilies.familyId))
    .innerJoin(users, eq(users.id, families.userId))
    .where(eq(sessionFamilies.sessionId, sessionId))
}

/** The session row, or 404. */
export async function findSession(db: DbOrTx, sessionId: string): Promise<SessionRow> {
  const [session] = await db.select().from(campSessions).where(eq(campSessions.id, sessionId)).limit(1)
  if (!session) throw new DomainError(404, 'Sessione non trovata')
  return session
}

/** The session row, locked until the end of the transaction so that moves and places never race. */
export async function lockSession(db: DbOrTx, sessionId: string): Promise<SessionRow> {
  const [session] = await db.select().from(campSessions).where(eq(campSessions.id, sessionId)).for('update')
  if (!session) throw new DomainError(404, 'Sessione non trovata')
  return session
}

export function requireEditable(session: SessionRow, what: string) {
  if (!isSessionEditable(session.status)) {
    throw new DomainError(409, `La sessione è «${enumLabel('sessionStatus', session.status)}»: ${what}`)
  }
}

/** What a family gives back when it leaves its place: its lodging and its activity group. */
const LEAVE_PLACE = { lodgingId: null, activityGroup: null } as const

/** The participations of the session that hold a place: titolari not declined nor removed. */
export const holdingPlace = (sessionId: string) =>
  and(eq(sessionFamilies.sessionId, sessionId), holdsPlace(sessionFamilies))

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`)
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(key(row))
    if (list) list.push(row)
    else map.set(key(row), [row])
  }
  return map
}

async function slotCountsOf(
  db: DbOrTx,
  sessions: Pick<SessionRow, 'id' | 'familySlots'>[],
): Promise<Map<string, SlotCounts>> {
  const ids = sessions.map(s => s.id)
  const rows = ids.length
    ? await db
        .select({
          id: sessionFamilies.id,
          sessionId: sessionFamilies.sessionId,
          kind: sessionFamilies.kind,
          status: sessionFamilies.status,
          reserveRank: sessionFamilies.reserveRank,
        })
        .from(sessionFamilies)
        .where(inArray(sessionFamilies.sessionId, ids))
    : []
  const bySession = groupBy(rows, row => row.sessionId)
  return new Map(sessions.map(s => [s.id, slotSummary(s.familySlots, bySession.get(s.id) ?? [])]))
}

/** The staff counts of sessions (StaffCounts); "Confermata" = accepted and, with a contract, signed. */
export async function staffCountsOf(
  db: DbOrTx,
  sessions: Pick<SessionRow, 'id' | 'staffNeeded' | 'contractDocumentId'>[],
): Promise<Map<string, StaffCounts>> {
  const ids = sessions.map(s => s.id)
  const contractIds = [...new Set(sessions.map(s => s.contractDocumentId).filter((id): id is string => !!id))]
  const [convocations, signed] = await Promise.all([
    ids.length
      ? db
          .select({
            sessionId: sessionStaff.sessionId,
            userId: sessionStaff.userId,
            status: sessionStaff.status,
            role: sessionStaff.role,
            team: staffProfiles.team,
          })
          .from(sessionStaff)
          .innerJoin(staffProfiles, eq(staffProfiles.userId, sessionStaff.userId))
          .where(inArray(sessionStaff.sessionId, ids))
      : [],
    contractIds.length
      ? db
          .select({ documentId: signatureRequests.documentId, userId: signatureRequests.userId })
          .from(signatureRequests)
          .where(and(inArray(signatureRequests.documentId, contractIds), eq(signatureRequests.status, 'signed')))
      : [],
  ])
  const signedKeys = new Set(signed.map(row => `${row.documentId}:${row.userId}`))
  const bySession = groupBy(convocations, row => row.sessionId)
  return new Map(
    sessions.map(session => {
      const counts: StaffCounts = {
        needed: session.staffNeeded,
        confirmed: 0,
        accepted: 0,
        waiting: 0,
        toSend: 0,
        open: 0,
        drafts: 0,
      }
      for (const convocation of bySession.get(session.id) ?? []) {
        if (OPEN_CONVOCATIONS.includes(convocation.status)) counts.open++
        if (convocation.status === 'draft') counts.drafts++
        if (!countsTowardNeeded(convocation)) continue
        if (convocation.status === 'accepted') {
          counts.accepted++
          const contract = session.contractDocumentId
          if (!contract || signedKeys.has(`${contract}:${convocation.userId}`)) counts.confirmed++
        } else if (convocation.status === 'sent') counts.waiting++
        else if (convocation.status === 'draft') counts.toSend++
      }
      return [session.id, counts]
    }),
  )
}

function toListItem(row: SessionRow, slots: SlotCounts, staff: StaffCounts): SessionListItem {
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    responseDeadline: row.responseDeadline,
    slots,
    staff,
  }
}

/** Upcoming sessions first (soonest first), then the past ones (most recent first). */
function sortSessions<T extends Pick<SessionRow, 'startDate' | 'endDate'>>(rows: T[], today: string): T[] {
  const upcoming = rows.filter(r => r.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const past = rows.filter(r => r.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate))
  return [...upcoming, ...past]
}

/** GET /api/admin/sessions (contract): every session, or those in the given statuses. */
export async function listSessions(
  db: DbOrTx,
  filter: { statuses?: SessionStatus[]; q?: string } = {},
  today: string = todayIso(),
): Promise<SessionListItem[]> {
  const conditions: SQL[] = []
  if (filter.statuses?.length) conditions.push(inArray(campSessions.status, filter.statuses))
  if (filter.q) conditions.push(ilike(campSessions.title, `%${escapeLike(filter.q)}%`))
  const rows = await db
    .select()
    .from(campSessions)
    .where(conditions.length ? and(...conditions) : undefined)
  const slots = await slotCountsOf(db, rows)
  const staff = await staffCountsOf(db, rows)
  return sortSessions(rows, today).map(row => toListItem(row, slots.get(row.id)!, staff.get(row.id)!))
}

/** A titolare who confirmed: the session is confirmed to it and, once it is over, it gets the questionnaire. */
const cameToSession = (row: Pick<ParticipationRow, 'kind' | 'status'>) =>
  row.kind === 'slot' && row.status === 'confirmed'

/**
 * Which families receive which email when the session moves to `to` (spec 3.2). `questionnaire`: completing
 * the session sends the questionnaire (opensQuestionnaire).
 */
function transitionRecipients(
  to: SessionStatus,
  rows: ParticipationRow[],
  questionnaire: boolean,
): { row: ParticipationRow; template: SessionEmailTemplate }[] {
  switch (to) {
    case 'inviting':
      return rows
        .filter(row => row.status === 'selected')
        .map(row => ({ row, template: row.kind === 'slot' ? 'session.invite' : 'session.reserve' }))
    case 'confirmed':
      return rows.filter(cameToSession).map(row => ({ row, template: 'session.confirmed' }))
    case 'completed':
      return questionnaire ? rows.filter(cameToSession).map(row => ({ row, template: 'session.feedback' })) : []
    case 'cancelled':
      // Only the families that had been told something: `selected` ones never heard of the session.
      return rows
        .filter(row => row.status === 'invited' || row.status === 'confirmed')
        .map(row => ({ row, template: 'session.cancelled' }))
    default:
      return []
  }
}

/** Completing the session sends the questionnaire: someone came, and the year was not imported (spec 3.13). */
async function opensQuestionnaire(
  db: DbOrTx,
  session: Pick<SessionRow, 'startDate'>,
  rows: ParticipationRow[],
): Promise<boolean> {
  return rows.some(cameToSession) && !(await isYearArchived(db, session.startDate))
}

/** Disabled accounts never receive emails (spec 3.7). */
function canReceive(row: Pick<ParticipationRow, 'userStatus'>): boolean {
  return row.userStatus !== 'disabled'
}

/** `staffNotices`: the staff emails of a cancellation (sessionConvocationNotices). */
function movesOf(
  session: SessionRow,
  rows: ParticipationRow[],
  staffNotices: number,
  questionnaire: boolean,
): SessionMove[] {
  return SESSION_TRANSITIONS[session.status].map(to => {
    const recipients = transitionRecipients(to, rows, questionnaire).filter(r => canReceive(r.row))
    const emailsByTemplate: Record<string, number> = {}
    for (const { template } of recipients) emailsByTemplate[template] = (emailsByTemplate[template] ?? 0) + 1
    const staffEmails = to === 'cancelled' ? staffNotices : 0
    if (staffEmails) emailsByTemplate['staff.convocation_cancelled'] = staffEmails
    return {
      to,
      label: SESSION_TRANSITION_ACTIONS[to],
      effect: SESSION_TRANSITION_EFFECTS[to],
      emails: recipients.length + staffEmails,
      emailsByTemplate,
    }
  })
}

/** GET /api/admin/sessions/:id */
export async function getSessionDetail(db: DbOrTx, sessionId: string): Promise<SessionDetail> {
  const row = await findSession(db, sessionId)
  const participations = await participationsOf(db, sessionId)
  const staff = (await staffCountsOf(db, [row])).get(row.id)!
  const [contract] = row.contractDocumentId
    ? await db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(eq(documents.id, row.contractDocumentId))
        .limit(1)
    : []
  const [convocations] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionStaff)
    .where(eq(sessionStaff.sessionId, sessionId))
  return {
    ...toListItem(row, slotSummary(row.familySlots, participations), staff),
    description: row.description,
    notes: row.notes,
    familySlots: row.familySlots,
    staffNeeded: row.staffNeeded,
    contractDocument: contract ?? null,
    statusChangedAt: iso(row.statusChangedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    moves: movesOf(
      row,
      participations,
      canTransition(row.status, 'cancelled') ? await sessionConvocationNotices(db, row.id) : 0,
      canTransition(row.status, 'completed') && (await opensQuestionnaire(db, row, participations)),
    ),
    deletable: row.status === 'draft' && participations.length === 0 && (convocations?.count ?? 0) === 0,
  }
}

/** Contracts a session can use: documents of category "contract" (archived ones only if already chosen). */
export async function contractOptions(db: DbOrTx): Promise<ContractOption[]> {
  const rows = await db
    .select({ id: documents.id, title: documents.title, archivedAt: documents.archivedAt })
    .from(documents)
    .where(eq(documents.category, 'contract'))
    .orderBy(desc(documents.createdAt))
  return rows.map(row => ({ id: row.id, title: row.title, archived: row.archivedAt !== null }))
}

function lateAnswer(respondedAt: Date | null, deadline: string | null): boolean {
  return !!respondedAt && !!deadline && todayIso(respondedAt) > deadline
}

function toFamilyItem(row: ParticipationRow, deadline: string | null): SessionFamilyItem {
  return {
    id: row.id,
    familyId: row.familyId,
    familyName: row.familyName,
    userId: row.userId,
    referent: `${row.firstName} ${row.lastName}`.trim(),
    email: row.email,
    phone: row.userPhone ?? row.familyPhone,
    city: row.city,
    accountStatus: row.userStatus,
    kind: row.kind,
    status: row.status,
    reserveRank: row.reserveRank,
    invitedAt: iso(row.invitedAt),
    respondedAt: iso(row.respondedAt),
    declineReason: row.declineReason,
    lateAnswer: lateAnswer(row.respondedAt, deadline),
    createdAt: row.createdAt.toISOString(),
  }
}

/** GET /api/admin/sessions/:id/families : titolari (by status) then reserves (in calling order). */
export async function sessionFamiliesOf(db: DbOrTx, sessionId: string): Promise<SessionFamiliesDto> {
  const session = await findSession(db, sessionId)
  const rows = await participationsOf(db, sessionId)
  const titolari = rows
    .filter(row => row.kind === 'slot')
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.familyName.localeCompare(b.familyName, 'it'))
  const waiting = waitingReserves(rows)
  const otherReserves = rows
    .filter(row => row.kind === 'reserve' && !isWaitingReserve(row))
    .sort((a, b) => a.familyName.localeCompare(b.familyName, 'it'))
  return {
    sessionId,
    status: session.status,
    familySlots: session.familySlots,
    responseDeadline: session.responseDeadline,
    slots: slotSummary(session.familySlots, rows),
    participations: [...titolari, ...waiting, ...otherReserves].map(row => toFamilyItem(row, session.responseDeadline)),
  }
}

/**
 * Families that can be added to the session: not in it yet, or in it no more (declined, cancelled).
 * Disabled accounts are left out: they cannot sign in nor receive the invitation.
 */
export async function sessionCandidates(db: DbOrTx, sessionId: string, q?: string): Promise<SessionCandidate[]> {
  const search = q?.trim()
  const pattern = search ? `%${escapeLike(search)}%` : null
  const rows = await db
    .select({
      id: families.id,
      name: families.name,
      firstName: users.firstName,
      lastName: users.lastName,
      city: families.city,
      province: families.province,
      formStatus: families.formStatus,
      previousStatus: sessionFamilies.status,
    })
    .from(families)
    .innerJoin(users, eq(users.id, families.userId))
    .leftJoin(sessionFamilies, and(eq(sessionFamilies.familyId, families.id), eq(sessionFamilies.sessionId, sessionId)))
    .where(
      and(
        ne(users.status, 'disabled'),
        or(isNull(sessionFamilies.id), inArray(sessionFamilies.status, ['declined', 'cancelled'])),
        pattern
          ? or(
              ilike(families.name, pattern),
              ilike(users.firstName, pattern),
              ilike(users.lastName, pattern),
              ilike(families.city, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(asc(families.name))
    .limit(500)
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    referent: `${row.firstName} ${row.lastName}`.trim(),
    city: row.city,
    province: row.province,
    formStatus: row.formStatus,
    previousStatus: row.previousStatus ?? null,
  }))
}

/** FamilyHistory (admin family page): every participation of one family, latest session first. */
export async function familyHistory(db: DbOrTx, familyId: string): Promise<FamilyParticipationItem[]> {
  const rows = await db
    .select({
      id: sessionFamilies.id,
      sessionId: campSessions.id,
      title: campSessions.title,
      startDate: campSessions.startDate,
      endDate: campSessions.endDate,
      sessionStatus: campSessions.status,
      kind: sessionFamilies.kind,
      status: sessionFamilies.status,
      reserveRank: sessionFamilies.reserveRank,
      invitedAt: sessionFamilies.invitedAt,
      respondedAt: sessionFamilies.respondedAt,
      declineReason: sessionFamilies.declineReason,
    })
    .from(sessionFamilies)
    .innerJoin(campSessions, eq(campSessions.id, sessionFamilies.sessionId))
    .where(eq(sessionFamilies.familyId, familyId))
    .orderBy(desc(campSessions.startDate))
  return rows.map(row => ({ ...row, invitedAt: iso(row.invitedAt), respondedAt: iso(row.respondedAt) }))
}

/**
 * GET /api/family/sessions : the family's sessions, only once invited. A participation never invited
 * (`selected`, or cancelled before the invitations left) stays invisible to the family (spec 3.3).
 */
export async function familySessions(db: DbOrTx, familyId: string): Promise<FamilySessionItem[]> {
  const rows = await db
    .select({
      id: sessionFamilies.id,
      sessionId: campSessions.id,
      title: campSessions.title,
      description: campSessions.description,
      location: campSessions.location,
      startDate: campSessions.startDate,
      endDate: campSessions.endDate,
      sessionStatus: campSessions.status,
      responseDeadline: campSessions.responseDeadline,
      kind: sessionFamilies.kind,
      status: sessionFamilies.status,
      invitedAt: sessionFamilies.invitedAt,
      respondedAt: sessionFamilies.respondedAt,
      declineReason: sessionFamilies.declineReason,
      feedbackOpen: sql<boolean>`${questionnaireOpen()}`,
      feedbackId: feedbackResponses.id,
    })
    .from(sessionFamilies)
    .innerJoin(campSessions, eq(campSessions.id, sessionFamilies.sessionId))
    .leftJoin(feedbackResponses, ownResponse())
    .where(
      and(
        eq(sessionFamilies.familyId, familyId),
        ne(sessionFamilies.status, 'selected'),
        isNotNull(sessionFamilies.invitedAt),
      ),
    )
    .orderBy(asc(campSessions.startDate))
  return rows.map(({ feedbackOpen, feedbackId, ...row }) => {
    const answerable = isSessionOpen(row.sessionStatus) && row.status === 'invited'
    return {
      ...row,
      feedback: feedbackOpen ? (feedbackId ? 'sent' : 'open') : null,
      invitedAt: iso(row.invitedAt),
      respondedAt: iso(row.respondedAt),
      canConfirm: answerable && row.kind === 'slot',
      canDecline: answerable,
    }
  })
}

// ─── Emails ────────────────────────────────────────────────────────────────────────────────────────

function factsOf(session: SessionRow): SessionEmailFacts {
  return {
    id: session.id,
    title: session.title,
    location: session.location,
    startDate: session.startDate,
    endDate: session.endDate,
    responseDeadline: session.responseDeadline,
  }
}

function familyEmail(
  ctx: EmailContext,
  template: SessionEmailTemplate,
  row: Pick<ParticipationRow, 'email' | 'userId' | 'firstName' | 'kind'>,
  session: SessionRow,
  options: { reminder?: boolean } = {},
): EmailMessage {
  const recipient = { to: row.email, toUserId: row.userId, firstName: row.firstName }
  const facts = factsOf(session)
  switch (template) {
    case 'session.invite':
      return sessionInviteEmail(ctx, recipient, facts, options)
    case 'session.reserve':
      return sessionReserveEmail(ctx, recipient, facts)
    case 'session.slot_offered':
      return sessionSlotOfferedEmail(ctx, recipient, facts)
    case 'session.confirmed':
      return sessionConfirmedEmail(ctx, recipient, facts)
    case 'session.cancelled':
      return sessionCancelledEmail(ctx, recipient, facts)
    case 'session.removed':
      return sessionRemovedEmail(ctx, recipient, facts, row.kind)
    case 'session.feedback':
      return sessionFeedbackEmail(ctx, recipient, facts)
  }
}

// ─── The session ───────────────────────────────────────────────────────────────────────────────────

/** A contract a session can use: a document of category "contract", not archived. */
async function isUsableContract(db: DbOrTx, documentId: string): Promise<boolean> {
  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.category, 'contract'), isNull(documents.archivedAt)))
    .limit(1)
  return Boolean(document)
}

async function assertContract(db: DbOrTx, documentId: string | null) {
  if (documentId && !(await isUsableContract(db, documentId))) {
    throw new DomainError(400, 'Il contratto scelto non è disponibile: scegline un altro')
  }
}

/** A new session, always a draft: nothing is sent until the invitations open. */
export async function createSession(
  db: DbOrTx,
  input: { values: SessionInput; actor: Actor },
): Promise<{ id: string }> {
  await assertContract(db, input.values.contractDocumentId)
  const [row] = await db
    .insert(campSessions)
    .values({ ...input.values, status: 'draft', createdBy: input.actor.userId })
    .returning({ id: campSessions.id })
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'session.create',
    entityType: 'session',
    entityId: row!.id,
    data: { title: input.values.title },
    ip: input.actor.ip,
  })
  return { id: row!.id }
}

const EDITABLE_FIELDS = [
  'title',
  'description',
  'location',
  'startDate',
  'endDate',
  'familySlots',
  'staffNeeded',
  'responseDeadline',
  'contractDocumentId',
  'notes',
] as const satisfies readonly (keyof SessionInput & keyof SessionRow)[]

/** Edits a session while it is a draft, inviting or confirmed; places never drop below the titolari. */
export async function updateSession(
  db: DbOrTx,
  input: { sessionId: string; values: SessionInput; actor: Actor },
): Promise<void> {
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'non si può più modificare')
  const held = slotSummary(session.familySlots, await participationsOf(db, session.id)).held
  if (input.values.familySlots < held) {
    throw new DomainError(
      409,
      `${held === 1 ? 'C’è già 1 famiglia titolare' : `Ci sono già ${held} famiglie titolari`}: i posti non possono essere meno di ${held}`,
    )
  }
  if (input.values.contractDocumentId !== session.contractDocumentId) {
    await assertContract(db, input.values.contractDocumentId)
  }
  const fields = EDITABLE_FIELDS.filter(field => input.values[field] !== session[field])
  if (!fields.length) return
  await db.update(campSessions).set(input.values).where(eq(campSessions.id, session.id))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'session.update',
    entityType: 'session',
    entityId: session.id,
    data: { fields },
    ip: input.actor.ip,
  })
}

/**
 * Moves the session to `to` (spec 3.2): draft → inviting invites the titolari and tells the reserves;
 * inviting → confirmed confirms to the titolari who confirmed; any → cancelled cancels every family
 * still in and tells those who had been invited, and withdraws every open convocation of the staff
 * (cancelSessionConvocations: those sent or accepted are told, their contract request is cancelled).
 * Returns the emails.
 */
export async function transitionSession(
  db: DbOrTx,
  ctx: EmailContext,
  input: { sessionId: string; to: SessionStatus; actor: Actor; now?: Date },
): Promise<{ from: SessionStatus; to: SessionStatus; emails: EmailMessage[] }> {
  const now = input.now ?? new Date()
  const session = await lockSession(db, input.sessionId)
  const from = session.status
  const to = input.to
  if (!canTransition(from, to)) {
    throw new DomainError(
      409,
      from === to
        ? `La sessione è già «${enumLabel('sessionStatus', to)}»`
        : `Una sessione «${enumLabel('sessionStatus', from)}» non può diventare «${enumLabel('sessionStatus', to)}»`,
    )
  }
  const rows = await participationsOf(db, session.id)
  const recipients = transitionRecipients(to, rows, to === 'completed' && (await opensQuestionnaire(db, session, rows)))

  let staffEmails: EmailMessage[] = []
  if (to === 'inviting') {
    await db
      .update(sessionFamilies)
      .set({ status: 'invited', invitedAt: now })
      .where(and(eq(sessionFamilies.sessionId, session.id), eq(sessionFamilies.status, 'selected')))
  } else if (to === 'cancelled') {
    // Before the status changes: a convocation is withdrawn only while its session is still open.
    staffEmails = await cancelSessionConvocations(db, ctx, { sessionId: session.id, actor: input.actor })
    await db
      .update(sessionFamilies)
      .set({ status: 'cancelled', ...LEAVE_PLACE })
      .where(and(eq(sessionFamilies.sessionId, session.id), inArray(sessionFamilies.status, ACTIVE_STATUSES)))
  }
  await db.update(campSessions).set({ status: to, statusChangedAt: now }).where(eq(campSessions.id, session.id))
  if (!isSessionEditable(to)) await freezeSessionProgramme(db, session)

  const emails = [
    ...recipients
      .filter(({ row }) => canReceive(row))
      .map(({ row, template }) => familyEmail(ctx, template, row, session)),
    ...staffEmails,
  ]
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'session.status',
    entityType: 'session',
    entityId: session.id,
    data: { from, to, emails: emails.length },
    ip: input.actor.ip,
  })
  return { from, to, emails }
}

/** Deletes a draft that has no families and no staff (P1). */
export async function deleteSession(db: DbOrTx, input: { sessionId: string; actor: Actor }): Promise<void> {
  const session = await lockSession(db, input.sessionId)
  if (session.status !== 'draft') {
    throw new DomainError(409, 'Puoi eliminare solo una sessione in bozza: questa puoi annullarla')
  }
  const [familiesIn] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionFamilies)
    .where(eq(sessionFamilies.sessionId, session.id))
  const [staffIn] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionStaff)
    .where(eq(sessionStaff.sessionId, session.id))
  if ((familiesIn?.count ?? 0) > 0 || (staffIn?.count ?? 0) > 0) {
    throw new DomainError(409, 'La sessione ha già famiglie o staff: toglili prima di eliminarla, oppure annullala')
  }
  await db.delete(campSessions).where(eq(campSessions.id, session.id))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'session.delete',
    entityType: 'session',
    entityId: session.id,
    data: { title: session.title },
    ip: input.actor.ip,
  })
}

/** A new draft with the same facts (P1): no families, no staff, the contract only if still usable. */
export async function duplicateSession(
  db: DbOrTx,
  input: { sessionId: string; actor: Actor },
): Promise<{ id: string }> {
  const [source] = await db.select().from(campSessions).where(eq(campSessions.id, input.sessionId)).limit(1)
  if (!source) throw new DomainError(404, 'Sessione non trovata')
  const [row] = await db
    .insert(campSessions)
    .values({
      title: `${source.title} (copia)`.slice(0, 120),
      description: source.description,
      location: source.location,
      startDate: source.startDate,
      endDate: source.endDate,
      familySlots: source.familySlots,
      staffNeeded: source.staffNeeded,
      responseDeadline: source.responseDeadline,
      contractDocumentId:
        source.contractDocumentId && (await isUsableContract(db, source.contractDocumentId))
          ? source.contractDocumentId
          : null,
      notes: source.notes,
      status: 'draft',
      createdBy: input.actor.userId,
    })
    .returning({ id: campSessions.id })
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'session.create',
    entityType: 'session',
    entityId: row!.id,
    data: { title: source.title, duplicateOf: source.id },
    ip: input.actor.ip,
  })
  return { id: row!.id }
}

// ─── Families in a session ─────────────────────────────────────────────────────────────────────────

/** Ranks 1…n of the reserves still waiting, in their calling order, after one leaves the list. */
async function renumberReserves(db: DbOrTx, sessionId: string): Promise<void> {
  const rows = await db
    .select({
      id: sessionFamilies.id,
      kind: sessionFamilies.kind,
      status: sessionFamilies.status,
      reserveRank: sessionFamilies.reserveRank,
      createdAt: sessionFamilies.createdAt,
    })
    .from(sessionFamilies)
    .where(and(eq(sessionFamilies.sessionId, sessionId), eq(sessionFamilies.kind, 'reserve')))
  for (const [index, row] of waitingReserves(rows).entries()) {
    if (row.reserveRank !== index + 1) {
      await db
        .update(sessionFamilies)
        .set({ reserveRank: index + 1 })
        .where(eq(sessionFamilies.id, row.id))
    }
  }
}

/**
 * Adds families as titolari or reserves (contract of POST /api/admin/sessions/:id/families). Titolari
 * beyond the free places are refused; reserves go to the end of the list. While the session is
 * inviting or confirmed they are invited at once (session.invite, session.reserve); in draft nothing
 * is sent. A family that had declined or been cancelled is added again on the same row.
 */
export async function addFamilies(
  db: DbOrTx,
  ctx: EmailContext,
  input: { sessionId: string; familyIds: string[]; kind: ParticipationKind; actor: Actor; now?: Date },
): Promise<{ added: number; invited: number; emails: EmailMessage[] }> {
  const now = input.now ?? new Date()
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'non puoi più aggiungere famiglie')
  const ids = [...new Set(input.familyIds)]
  if (!ids.length) throw new DomainError(400, 'Scegli almeno una famiglia')

  const found = await db
    .select({
      id: families.id,
      name: families.name,
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      userStatus: users.status,
    })
    .from(families)
    .innerJoin(users, eq(users.id, families.userId))
    .where(inArray(families.id, ids))
  if (found.length !== ids.length) throw new DomainError(404, 'Una delle famiglie scelte non esiste più')
  const byId = new Map(found.map(family => [family.id, family]))

  const rows = await participationsOf(db, session.id)
  const existing = new Map(rows.map(row => [row.familyId, row]))
  const already = ids.map(id => existing.get(id)).filter(row => row && ACTIVE_STATUSES.includes(row.status))
  if (already.length) {
    const names = already.map(row => row!.familyName).join(', ')
    throw new DomainError(409, `${names} ${already.length === 1 ? 'è già' : 'sono già'} nella sessione`)
  }
  if (input.kind === 'slot') {
    const free = freeSlots(session.familySlots, rows)
    if (ids.length > free) {
      throw new DomainError(
        409,
        free === 0
          ? 'Non ci sono posti liberi: aggiungi la famiglia come riserva'
          : `Restano ${plural(free, 'posto libero', 'posti liberi')}: aggiungi le altre famiglie come riserve`,
      )
    }
  }

  const open = isSessionOpen(session.status)
  let rank = nextReserveRank(rows)
  const emails: EmailMessage[] = []
  for (const id of ids) {
    const values = {
      kind: input.kind,
      status: (open ? 'invited' : 'selected') as ParticipationStatus,
      reserveRank: input.kind === 'reserve' ? rank++ : null,
      invitedAt: open ? now : null,
      respondedAt: null,
      declineReason: null,
    }
    const previous = existing.get(id)
    if (previous) {
      await db.update(sessionFamilies).set(values).where(eq(sessionFamilies.id, previous.id))
    } else {
      await db.insert(sessionFamilies).values({ sessionId: session.id, familyId: id, ...values })
    }
    const family = byId.get(id)!
    if (open && canReceive(family)) {
      const template = input.kind === 'slot' ? 'session.invite' : 'session.reserve'
      emails.push(familyEmail(ctx, template, { ...family, kind: input.kind }, session))
    }
  }
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'participation.add',
    entityType: 'session',
    entityId: session.id,
    data: { kind: input.kind, familyIds: ids, invited: open },
    ip: input.actor.ip,
  })
  return { added: ids.length, invited: open ? ids.length : 0, emails }
}

/**
 * Calls a reserve to a free place (spec 3.3): the chosen one or the first waiting. It becomes a
 * titolare; in inviting/confirmed it is invited at once with session.slot_offered, in draft it is
 * selected. Never automatic: the administration decides when.
 */
export async function callReserve(
  db: DbOrTx,
  ctx: EmailContext,
  input: { sessionId: string; participationId?: string; actor: Actor; now?: Date },
): Promise<{ participationId: string; familyName: string; emails: EmailMessage[] }> {
  const now = input.now ?? new Date()
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'non puoi più chiamare le riserve')
  const rows = await participationsOf(db, session.id)
  if (freeSlots(session.familySlots, rows) === 0) {
    throw new DomainError(409, 'Non ci sono posti liberi: chiama la riserva quando una famiglia rinuncia o viene tolta')
  }
  const target = input.participationId ? rows.find(row => row.id === input.participationId) : nextReserve(rows)
  if (!target) throw new DomainError(409, 'Non ci sono riserve in attesa')
  if (!isWaitingReserve(target)) throw new DomainError(409, `${target.familyName} non è una riserva in attesa`)

  const open = isSessionOpen(session.status)
  await db
    .update(sessionFamilies)
    .set({
      kind: 'slot',
      reserveRank: null,
      status: open ? 'invited' : 'selected',
      invitedAt: open ? now : null,
      respondedAt: null,
      declineReason: null,
    })
    .where(eq(sessionFamilies.id, target.id))
  await renumberReserves(db, session.id)
  const emails = open && canReceive(target) ? [familyEmail(ctx, 'session.slot_offered', target, session)] : []
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'participation.call_reserve',
    entityType: 'session_family',
    entityId: target.id,
    data: { sessionId: session.id, invited: open },
    ip: input.actor.ip,
  })
  return { participationId: target.id, familyName: target.familyName, emails }
}

/**
 * The answer to an invitation (spec 3.3): Conferma (`confirmed`) or Rinuncia (`declined`, with an
 * optional reason; the place frees up). From the family (only its own participation, only while
 * `invited`) or recorded by the administration after a phone call (also a confirmed family that
 * withdraws). Allowed while the session is inviting or confirmed, after the deadline too. A reserve
 * can only leave the list: it confirms after being called.
 */
export async function answerInvitation(
  db: DbOrTx,
  input: {
    participationId: string
    answer: 'confirmed' | 'declined'
    reason?: string | null
    by: 'family' | 'admin'
    /** The signed-in family: the participation must be its own. */
    familyId?: string
    /** The session of the admin route: the participation must belong to it. */
    sessionId?: string
    actor: Actor
    now?: Date
  },
): Promise<{ status: ParticipationStatus; late: boolean; emails: EmailMessage[] }> {
  const now = input.now ?? new Date()
  const notFound = () => new DomainError(404, 'Invito non trovato')
  // The session row first, then the participation: the order every move of the administration takes.
  const [target] = await db
    .select({ sessionId: sessionFamilies.sessionId })
    .from(sessionFamilies)
    .where(
      and(
        eq(sessionFamilies.id, input.participationId),
        input.familyId ? eq(sessionFamilies.familyId, input.familyId) : undefined,
        input.sessionId ? eq(sessionFamilies.sessionId, input.sessionId) : undefined,
      ),
    )
  if (!target) throw notFound()
  const session = await lockSession(db, target.sessionId)
  const [row] = await db
    .select()
    .from(sessionFamilies)
    .where(eq(sessionFamilies.id, input.participationId))
    .for('update')
  if (!row || (input.by === 'family' && (!row.invitedAt || row.status === 'selected'))) throw notFound()
  if (!isSessionOpen(session.status)) {
    throw new DomainError(409, `La sessione è «${enumLabel('sessionStatus', session.status)}»: non accetta risposte`)
  }
  if (input.answer === 'confirmed' && row.kind === 'reserve') {
    throw new DomainError(409, 'Una famiglia in lista di riserva può confermare solo quando viene chiamata')
  }
  const answerable =
    row.status === 'invited' || (input.by === 'admin' && row.status === 'confirmed' && input.answer === 'declined')
  if (!answerable) {
    throw new DomainError(
      409,
      row.status === 'cancelled'
        ? 'La partecipazione è stata annullata'
        : input.by === 'family'
          ? 'Hai già risposto a questo invito'
          : `La famiglia ha già risposto: «${enumLabel('participationStatus', row.status)}»`,
    )
  }

  await db
    .update(sessionFamilies)
    .set({
      status: input.answer,
      respondedAt: now,
      declineReason: input.answer === 'declined' ? input.reason?.trim() || null : null,
      ...(input.answer === 'declined' && LEAVE_PLACE),
    })
    .where(eq(sessionFamilies.id, row.id))
  if (row.kind === 'reserve') await renumberReserves(db, row.sessionId)
  const late = lateAnswer(now, session.responseDeadline)
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: input.by === 'admin' ? 'participation.answer_by_admin' : 'participation.answer',
    entityType: 'session_family',
    entityId: row.id,
    // The reason stays out of the audit: a family may write health details in it.
    data: { sessionId: row.sessionId, answer: input.answer, late },
    ip: input.actor.ip,
  })
  return { status: input.answer, late, emails: [] }
}

/**
 * Removes a family from the session (spec 3.3): `cancelled`, with session.removed when it had been
 * invited. Its place, if it held one, frees up.
 */
export async function cancelParticipation(
  db: DbOrTx,
  ctx: EmailContext,
  input: { sessionId: string; participationId: string; actor: Actor },
): Promise<{ emails: EmailMessage[] }> {
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'non puoi più togliere famiglie')
  const rows = await participationsOf(db, session.id)
  const target = rows.find(row => row.id === input.participationId)
  if (!target) throw new DomainError(404, 'La famiglia non è in questa sessione')
  if (!ACTIVE_STATUSES.includes(target.status)) {
    throw new DomainError(409, `${target.familyName} non è più nella sessione`)
  }
  const wasInvited = target.status !== 'selected'
  await db
    .update(sessionFamilies)
    .set({ status: 'cancelled', ...LEAVE_PLACE })
    .where(eq(sessionFamilies.id, target.id))
  if (target.kind === 'reserve') await renumberReserves(db, session.id)
  const emails = wasInvited && canReceive(target) ? [familyEmail(ctx, 'session.removed', target, session)] : []
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'participation.cancel',
    entityType: 'session_family',
    entityId: target.id,
    data: { sessionId: session.id, kind: target.kind, from: target.status },
    ip: input.actor.ip,
  })
  return { emails }
}

/** New calling order of the reserves still waiting: `order` lists every one of them, first to call first. */
export async function reorderReserves(
  db: DbOrTx,
  input: { sessionId: string; order: string[]; actor: Actor },
): Promise<{ emails: EmailMessage[] }> {
  const session = await lockSession(db, input.sessionId)
  requireEditable(session, 'non puoi più riordinare le riserve')
  const waiting = waitingReserves(await participationsOf(db, session.id))
  const ids = new Set(waiting.map(row => row.id))
  if (
    input.order.length !== waiting.length ||
    new Set(input.order).size !== input.order.length ||
    !input.order.every(id => ids.has(id))
  ) {
    throw new DomainError(409, 'La lista delle riserve è cambiata nel frattempo: ricarica la pagina e riprova')
  }
  for (const [index, id] of input.order.entries()) {
    const current = waiting.find(row => row.id === id)!
    if (current.reserveRank !== index + 1) {
      await db
        .update(sessionFamilies)
        .set({ reserveRank: index + 1 })
        .where(eq(sessionFamilies.id, id))
    }
  }
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'participation.reorder',
    entityType: 'session',
    entityId: session.id,
    data: { order: input.order },
    ip: input.actor.ip,
  })
  return { emails: [] }
}

/**
 * Sends the invitation again to a family that has not answered yet (session.invite as a reminder for
 * a titolare, session.reserve for a reserve).
 */
export async function resendInvitation(
  db: DbOrTx,
  ctx: EmailContext,
  input: { sessionId: string; participationId: string; actor: Actor },
): Promise<{ emails: EmailMessage[] }> {
  const session = await lockSession(db, input.sessionId)
  if (!isSessionOpen(session.status)) {
    throw new DomainError(409, 'Gli inviti partono quando la sessione apre gli inviti')
  }
  const target = (await participationsOf(db, session.id)).find(row => row.id === input.participationId)
  if (!target) throw new DomainError(404, 'La famiglia non è in questa sessione')
  if (target.status !== 'invited') {
    throw new DomainError(409, 'Puoi inviare di nuovo solo un invito ancora senza risposta')
  }
  if (!canReceive(target)) {
    throw new DomainError(409, 'L’account della famiglia è disattivato: non riceve email')
  }
  const emails =
    target.kind === 'slot'
      ? [familyEmail(ctx, 'session.invite', target, session, { reminder: true })]
      : [familyEmail(ctx, 'session.reserve', target, session)]
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'participation.resend',
    entityType: 'session_family',
    entityId: target.id,
    data: { sessionId: session.id, template: emails[0]!.template },
    ip: input.actor.ip,
  })
  return { emails }
}

// ─── Export (P1) ───────────────────────────────────────────────────────────────────────────────────

/** The families of a session as CSV. No health details. */
export async function participantsCsv(db: DbOrTx, sessionId: string): Promise<{ filename: string; csv: string }> {
  const session = await findSession(db, sessionId)
  const dto = await sessionFamiliesOf(db, sessionId)
  const header = [
    'Famiglia',
    'Referente',
    'Email',
    'Telefono',
    'Città',
    'Posto',
    'Stato',
    'Posizione in riserva',
    'Invitata il',
    'Risposta il',
    'Motivo della rinuncia',
  ]
  const lines = dto.participations.map(p => [
    p.familyName,
    p.referent,
    p.email,
    p.phone,
    p.city,
    enumLabel('participationKind', p.kind),
    enumLabel('participationStatus', p.status),
    p.kind === 'reserve' && isWaitingReserve(p) ? p.reserveRank : null,
    formatDateTime(p.invitedAt),
    formatDateTime(p.respondedAt),
    p.declineReason,
  ])
  return sessionCsv(session, 'partecipanti', [header, ...lines])
}
