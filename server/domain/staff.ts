// The staff area (docs/spec.md 3.4, 3.5): the application and its review, availability, convocations to
// sessions and the contract that follows an accepted convocation. Explicit imports only, so the database
// tests load this module directly. Functions take the client or a transaction; those that produce emails
// return them, and the handler delivers them after the commit. A review never sends anything by itself:
// the outcome leaves only from staffOutcomeEmails ("Comunica l’esito").
import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  applicationMissing,
  canMoveStaff,
  isReviewMove,
  type ConvocationAddInput,
  type ConvocationSendInput,
  type StaffApplicationDraft,
  type StaffApplicationInput,
  type StaffUsefulInfoInput,
} from '../../shared/schemas/staff'
import { normalizeUsefulInfo } from '../../shared/schemas/families'
import type { FileDto } from '../../shared/types/api'
import type {
  AvailabilitySession,
  AvailableStaff,
  ContractState,
  MyAvailability,
  MyConvocation,
  SessionConvocation,
  SessionStaffData,
  StaffApplicationDto,
  StaffConvocationSummary,
  StaffDetail,
  StaffDocumentDto,
  StaffHome,
  StaffListItem,
  StaffOutcomeTemplate,
  StaffUsefulInfoDto,
} from '../../shared/types/staff'
import {
  OPEN_CONVOCATIONS,
  type ConvocationStatus,
  type SignatureStatus,
  type StaffRole,
  type StaffStatus,
  type StaffTeam,
} from '../../shared/utils/constants'
import { todayIso } from '../../shared/utils/dates'
import { SESSION_EDITABLE_STATUSES, isSessionEditable } from '../../shared/utils/session-status'
import {
  campSessions,
  documents,
  emailLog,
  files,
  personalDocuments,
  sessionStaff,
  sessionAvailability,
  signatureRequests,
  staffProfiles,
  users,
} from '../db/schema'
import {
  convocationCancelledEmail,
  convocationEmail,
  defaultOutcomeMessage,
  outcomeSubject,
  staffOutcomeEmail,
} from '../emails/staff'
import type { EmailContext, EmailMessage } from '../emails/types'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { requestSignatures, signatureRequestEmails } from './signature-requests'
import { createError } from './errors'

/** What a convocation declined or withdrawn lets go: its activity group and its lodging. */
const LEAVE_SESSION = { activityGroup: null, lodgingId: null } as const

/** GET /api/staff/useful-info */
export async function staffUsefulInfo(db: DbOrTx, userId: string): Promise<StaffUsefulInfoDto> {
  const [row] = await db
    .select({ info: staffProfiles.usefulInfo, consentAt: staffProfiles.usefulInfoConsentAt })
    .from(staffProfiles)
    .where(eq(staffProfiles.userId, userId))
  return { info: row?.info ?? null, consentAt: row?.consentAt?.toISOString() ?? null }
}

/** Saves the canteen details of a staff member with the consent, or clears both; audited without the values. */
export async function saveStaffUsefulInfo(
  db: DbOrTx,
  input: { userId: string; value: StaffUsefulInfoInput; actor: { userId: string; ip: string | null } },
): Promise<StaffUsefulInfoDto> {
  const info = normalizeUsefulInfo(input.value.info)
  const [row] = await db
    .update(staffProfiles)
    .set({ usefulInfo: info, usefulInfoConsentAt: info ? new Date() : null })
    .where(eq(staffProfiles.userId, input.userId))
    .returning({ consentAt: staffProfiles.usefulInfoConsentAt })
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'staff.useful_info',
    entityType: 'staff_profile',
    entityId: input.userId,
    data: { fields: info ? Object.keys(info) : [] },
    ip: input.actor.ip,
  })
  return { info, consentAt: row?.consentAt?.toISOString() ?? null }
}

/** A disabled account leaves the open sessions: its convocations let go of their group and lodging. */
export async function leaveOpenSessions(db: DbOrTx, userId: string): Promise<void> {
  await db
    .update(sessionStaff)
    .set(LEAVE_SESSION)
    .where(
      and(
        eq(sessionStaff.userId, userId),
        inArray(
          sessionStaff.sessionId,
          db
            .select({ id: campSessions.id })
            .from(campSessions)
            .where(inArray(campSessions.status, [...SESSION_EDITABLE_STATUSES])),
        ),
      ),
    )
}

type ProfileRow = typeof staffProfiles.$inferSelect
type FileRow = typeof files.$inferSelect

/** Who acts, for the audit log. */
export interface Actor {
  userId: string
  ip?: string | null
}

const NOT_EDITABLE = 'La candidatura è già stata inviata: non si può più modificare'
const BEFORE_APPROVAL = 'Potrai indicare la tua disponibilità dopo l’approvazione della candidatura'
const SESSION_CLOSED = 'La sessione è conclusa o annullata: le convocazioni non si possono più cambiare'

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null

export function toFileDto(
  file: Pick<FileRow, 'id' | 'originalName' | 'mimeType' | 'sizeBytes' | 'createdAt'>,
): FileDto {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt.toISOString(),
  }
}

/** The fields of a session the availability pages show. */
const availabilitySession = {
  id: campSessions.id,
  title: campSessions.title,
  startDate: campSessions.startDate,
  endDate: campSessions.endDate,
}

async function profileOf(db: DbOrTx, userId: string, options: { lock?: boolean } = {}): Promise<ProfileRow> {
  const query = db.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1)
  const [profile] = options.lock ? await query.for('update') : await query
  if (!profile) throw createError({ statusCode: 404, message: 'Profilo staff non trovato' })
  return profile
}

// ─── Contract and confirmation (derived, never stored) ─────────────────────────────────────────────

/** The contract of a convocation, from the session's contract and the person's request for it. */
export function contractState(
  contractDocumentId: string | null,
  request: { status: SignatureStatus } | undefined,
): ContractState {
  if (!contractDocumentId) return 'none'
  if (request?.status === 'signed') return 'signed'
  if (request?.status === 'pending') return 'pending'
  return 'missing'
}

/** "Confermata": accepted and, if the session has a contract, signed. */
export function isConfirmed(status: ConvocationStatus, contract: ContractState): boolean {
  return status === 'accepted' && (contract === 'none' || contract === 'signed')
}

/** The signature requests of (document, person) pairs, keyed "documentId:userId". */
async function contractRequests(
  db: DbOrTx,
  pairs: { documentId: string; userId: string }[],
): Promise<Map<string, { id: string; status: SignatureStatus }>> {
  const map = new Map<string, { id: string; status: SignatureStatus }>()
  if (!pairs.length) return map
  const rows = await db
    .select({
      id: signatureRequests.id,
      status: signatureRequests.status,
      documentId: signatureRequests.documentId,
      userId: signatureRequests.userId,
    })
    .from(signatureRequests)
    .where(
      and(
        inArray(signatureRequests.documentId, [...new Set(pairs.map(pair => pair.documentId))]),
        inArray(signatureRequests.userId, [...new Set(pairs.map(pair => pair.userId))]),
      ),
    )
  for (const row of rows) map.set(`${row.documentId}:${row.userId}`, { id: row.id, status: row.status })
  return map
}

// ─── Application ───────────────────────────────────────────────────────────────────────────────────

/** Saves what the person wrote so far; only while the application has not been sent. */
export async function saveApplicationDraft(db: DbOrTx, userId: string, input: StaffApplicationDraft): Promise<void> {
  const profile = await profileOf(db, userId, { lock: true })
  if (profile.status !== 'registered') throw createError({ statusCode: 409, message: NOT_EDITABLE })
  const values: Partial<typeof staffProfiles.$inferInsert> = {}
  if (input.team !== undefined) values.team = input.team
  if (input.birthDate !== undefined) values.birthDate = input.birthDate
  if (input.city !== undefined) values.city = input.city || null
  if (input.roles !== undefined) values.roles = [...new Set(input.roles)]
  if (input.qualifications !== undefined) values.qualifications = input.qualifications || null
  if (input.experience !== undefined) values.experience = input.experience || null
  if (input.motivation !== undefined) values.motivation = input.motivation || null
  if (Object.keys(values).length) await db.update(staffProfiles).set(values).where(eq(staffProfiles.id, profile.id))
}

/** Attaches an uploaded CV while the application is open; returns the id of the CV it replaces. */
export async function replaceCv(db: DbOrTx, userId: string, fileId: string): Promise<string | null> {
  const profile = await profileOf(db, userId, { lock: true })
  if (profile.status !== 'registered') throw createError({ statusCode: 409, message: NOT_EDITABLE })
  await db.update(staffProfiles).set({ cvFileId: fileId }).where(eq(staffProfiles.id, profile.id))
  return profile.cvFileId && profile.cvFileId !== fileId ? profile.cvFileId : null
}

/** registered → applied: the whole application, with the CV already uploaded. Sends nothing. */
export async function submitApplication(
  db: DbOrTx,
  userId: string,
  input: StaffApplicationInput,
  actor: Partial<Actor> = {},
): Promise<void> {
  const profile = await profileOf(db, userId, { lock: true })
  if (profile.status !== 'registered') throw createError({ statusCode: 409, message: NOT_EDITABLE })
  if (!profile.cvFileId) {
    throw createError({ statusCode: 400, message: 'Carica il tuo CV in PDF prima di inviare la candidatura' })
  }
  await db
    .update(staffProfiles)
    .set({ ...input, roles: [...new Set(input.roles)], status: 'applied', appliedAt: new Date() })
    .where(eq(staffProfiles.id, profile.id))
  await writeAudit(db, {
    actorUserId: userId,
    action: 'staff.apply',
    entityType: 'user',
    entityId: userId,
    ip: actor.ip ?? null,
  })
}

// ─── Review ────────────────────────────────────────────────────────────────────────────────────────

/** The outcome email the status calls for. */
export function outcomeTemplate(status: StaffStatus): StaffOutcomeTemplate | null {
  if (status === 'approved') return 'staff.approved'
  if (status === 'rejected') return 'staff.rejected'
  return null
}

/**
 * A move of the administration (STAFF_STATUS_MOVES): approve or reject an application, deactivate or
 * reactivate approved staff. Notes, when given, are saved with it. No email: see staffOutcomeEmails.
 */
export async function changeStaffStatus(
  db: DbOrTx,
  input: { userId: string; status: StaffStatus; notes?: string | null; actor: Actor },
): Promise<ProfileRow> {
  const profile = await profileOf(db, input.userId, { lock: true })
  if (!canMoveStaff(profile.status, input.status)) {
    throw createError({
      statusCode: 409,
      message:
        profile.status === 'registered'
          ? 'La candidatura non è ancora stata inviata: non si può valutare'
          : 'Questo cambio di stato non è possibile',
    })
  }
  const review = isReviewMove(profile.status, input.status)
  const [updated] = await db
    .update(staffProfiles)
    .set({
      status: input.status,
      ...(input.notes !== undefined ? { reviewNotes: input.notes?.trim() || null } : {}),
      ...(review ? { reviewedAt: new Date(), reviewedBy: input.actor.userId } : {}),
    })
    .where(eq(staffProfiles.id, profile.id))
    .returning()
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: review ? 'staff.review' : 'staff.status',
    entityType: 'user',
    entityId: input.userId,
    data: { from: profile.status, to: input.status },
    ip: input.actor.ip ?? null,
  })
  return updated!
}

/** Approves several applications at once; the ones no longer waiting are left as they are. */
export async function approveApplications(
  db: DbOrTx,
  input: { userIds: string[]; actor: Actor },
): Promise<{ approved: number; skipped: number }> {
  const userIds = [...new Set(input.userIds)]
  const waiting = await db
    .select({ id: staffProfiles.id, userId: staffProfiles.userId })
    .from(staffProfiles)
    .where(and(inArray(staffProfiles.userId, userIds), eq(staffProfiles.status, 'applied')))
    .for('update')
  if (waiting.length) {
    await db
      .update(staffProfiles)
      .set({ status: 'approved', reviewedAt: new Date(), reviewedBy: input.actor.userId })
      .where(
        inArray(
          staffProfiles.id,
          waiting.map(row => row.id),
        ),
      )
    for (const row of waiting) {
      await writeAudit(db, {
        actorUserId: input.actor.userId,
        action: 'staff.review',
        entityType: 'user',
        entityId: row.userId,
        data: { from: 'applied', to: 'approved', bulk: true },
        ip: input.actor.ip ?? null,
      })
    }
  }
  return { approved: waiting.length, skipped: userIds.length - waiting.length }
}

/**
 * Moves a person between staff and v-team; their convocations keep the role they have. While the
 * application is a draft the team is the person's choice, in the form.
 */
export async function setStaffTeam(
  db: DbOrTx,
  input: { userId: string; team: StaffTeam; actor: Actor },
): Promise<void> {
  const profile = await profileOf(db, input.userId, { lock: true })
  if (profile.status === 'registered') {
    throw createError({ statusCode: 409, message: 'La squadra la sceglie la persona, finché non invia la candidatura' })
  }
  if (profile.team === input.team) return
  await db.update(staffProfiles).set({ team: input.team }).where(eq(staffProfiles.id, profile.id))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'staff.team',
    entityType: 'user',
    entityId: input.userId,
    data: { from: profile.team, to: input.team },
    ip: input.actor.ip ?? null,
  })
}

/** Internal notes of the review, never shown to the person. */
export async function saveReviewNotes(db: DbOrTx, userId: string, notes: string): Promise<void> {
  const profile = await profileOf(db, userId)
  await db
    .update(staffProfiles)
    .set({ reviewNotes: notes.trim() || null })
    .where(eq(staffProfiles.id, profile.id))
}

/** "Comunica l’esito": the outcome email of the current status, with the message the administration kept. */
export async function staffOutcomeEmails(
  db: DbOrTx,
  ctx: EmailContext,
  input: { userId: string; message: string; actor: Actor },
): Promise<EmailMessage[]> {
  const [row] = await db
    .select({
      status: staffProfiles.status,
      email: users.email,
      firstName: users.firstName,
      accountStatus: users.status,
    })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .where(eq(staffProfiles.userId, input.userId))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'Persona dello staff non trovata' })
  const template = outcomeTemplate(row.status)
  if (!template) {
    throw createError({
      statusCode: 409,
      message: 'L’esito si comunica dopo aver approvato o non selezionato la candidatura',
    })
  }
  if (row.accountStatus === 'disabled') {
    throw createError({ statusCode: 409, message: 'L’account è disattivato: non riceve email' })
  }
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'staff.outcome_sent',
    entityType: 'user',
    entityId: input.userId,
    data: { template },
    ip: input.actor.ip ?? null,
  })
  return [
    staffOutcomeEmail(ctx, {
      to: row.email,
      toUserId: input.userId,
      firstName: row.firstName,
      template,
      message: input.message,
    }),
  ]
}

// ─── Availability ──────────────────────────────────────────────────────────────────────────────────

/** The sessions availability is asked for: not started yet, neither concluded nor cancelled. */
function openForAvailability(today: string) {
  return and(inArray(campSessions.status, [...SESSION_EDITABLE_STATUSES]), gt(campSessions.startDate, today))
}

/**
 * "Ci sono" for the whole of a session, or not any more (approved staff only, sessions not started yet).
 * Withdrawing keeps the convocations already received: the administration sees the change on them.
 */
export async function setAvailability(
  db: DbOrTx,
  input: { userId: string; sessionId: string; available: boolean },
  today: string = todayIso(),
): Promise<void> {
  const profile = await profileOf(db, input.userId)
  if (profile.status !== 'approved') throw createError({ statusCode: 403, message: BEFORE_APPROVAL })
  const session = await sessionFor(db, input.sessionId)
  if (!isSessionEditable(session.status) || session.startDate <= today) {
    throw createError({ statusCode: 409, message: 'La sessione è già iniziata, conclusa o annullata' })
  }
  if (input.available) {
    await db
      .insert(sessionAvailability)
      .values({ sessionId: input.sessionId, userId: input.userId })
      .onConflictDoNothing()
  } else {
    await db
      .delete(sessionAvailability)
      .where(and(eq(sessionAvailability.sessionId, input.sessionId), eq(sessionAvailability.userId, input.userId)))
  }
}

// ─── Convocations ──────────────────────────────────────────────────────────────────────────────────

async function sessionFor(db: DbOrTx, sessionId: string, options: { editable?: boolean } = {}) {
  const [session] = await db.select().from(campSessions).where(eq(campSessions.id, sessionId)).limit(1)
  if (!session) throw createError({ statusCode: 404, message: 'Sessione non trovata' })
  if (options.editable && !isSessionEditable(session.status)) {
    throw createError({ statusCode: 409, message: SESSION_CLOSED })
  }
  return session
}

/**
 * Adds approved staff to a session as convocations to send (`draft`), each with a role. A person whose
 * earlier convocation was declined or cancelled is convoked again; one already convoked is kept as is.
 */
export async function addConvocations(
  db: DbOrTx,
  input: ConvocationAddInput & { actor: Actor },
): Promise<{ added: number; kept: number }> {
  await sessionFor(db, input.sessionId, { editable: true })
  const people = [...new Map(input.people.map(person => [person.userId, person])).values()]
  const userIds = people.map(person => person.userId)
  const eligible = await db
    .select({ userId: staffProfiles.userId })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .where(
      and(inArray(staffProfiles.userId, userIds), eq(staffProfiles.status, 'approved'), ne(users.status, 'disabled')),
    )
  if (eligible.length !== userIds.length) {
    throw createError({
      statusCode: 409,
      message: 'Si possono convocare solo persone dello staff approvato con un account attivo',
    })
  }
  const existing = await db
    .select()
    .from(sessionStaff)
    .where(and(eq(sessionStaff.sessionId, input.sessionId), inArray(sessionStaff.userId, userIds)))
    .for('update')
  const byUser = new Map(existing.map(row => [row.userId, row]))
  const fresh = people.filter(person => !byUser.has(person.userId))
  const again = people.filter(person => {
    const status = byUser.get(person.userId)?.status
    return status === 'declined' || status === 'cancelled'
  })
  const inserted = fresh.length
    ? await db
        .insert(sessionStaff)
        .values(fresh.map(person => ({ sessionId: input.sessionId, userId: person.userId, role: person.role })))
        .onConflictDoNothing()
        .returning({ userId: sessionStaff.userId })
    : []
  for (const person of again) {
    await db
      .update(sessionStaff)
      .set({ status: 'draft', role: person.role, message: null, sentAt: null, respondedAt: null, declineReason: null })
      .where(eq(sessionStaff.id, byUser.get(person.userId)!.id))
  }
  const added = [...inserted.map(row => row.userId), ...again.map(person => person.userId)]
  if (added.length) {
    await writeAudit(db, {
      actorUserId: input.actor.userId,
      action: 'convocation.add',
      entityType: 'session',
      entityId: input.sessionId,
      data: { userIds: added },
      ip: input.actor.ip ?? null,
    })
  }
  return { added: added.length, kept: people.length - added.length }
}

/**
 * "Invia la convocazione": the chosen drafts become `sent` with the optional message, one
 * `staff.convocation` email each. Drafts of people no longer approved (or disabled) stay drafts.
 */
export async function sendConvocations(
  db: DbOrTx,
  ctx: EmailContext,
  input: ConvocationSendInput & { actor: Actor },
): Promise<{ emails: EmailMessage[]; sent: number; skipped: number }> {
  const session = await sessionFor(db, input.sessionId, { editable: true })
  const ids = [...new Set(input.ids)]
  const rows = await db
    .select({
      id: sessionStaff.id,
      status: sessionStaff.status,
      role: sessionStaff.role,
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      accountStatus: users.status,
      profileStatus: staffProfiles.status,
    })
    .from(sessionStaff)
    .innerJoin(users, eq(users.id, sessionStaff.userId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, sessionStaff.userId))
    .where(and(eq(sessionStaff.sessionId, session.id), inArray(sessionStaff.id, ids)))
    .for('update', { of: sessionStaff })
  if (rows.length !== ids.length) throw createError({ statusCode: 404, message: 'Convocazione non trovata' })
  const drafts = rows.filter(row => row.status === 'draft')
  const sendable = drafts.filter(row => row.profileStatus === 'approved' && row.accountStatus !== 'disabled')
  if (!sendable.length) {
    throw createError({
      statusCode: 409,
      message: drafts.length
        ? 'Queste persone non possono ricevere la convocazione: non sono più nello staff approvato'
        : 'Queste convocazioni sono già state inviate',
    })
  }
  const message = input.message?.trim() || null
  await db
    .update(sessionStaff)
    .set({ status: 'sent', sentAt: new Date(), message })
    .where(
      inArray(
        sessionStaff.id,
        sendable.map(row => row.id),
      ),
    )
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'convocation.send',
    entityType: 'session',
    entityId: session.id,
    data: { convocationIds: sendable.map(row => row.id), withMessage: Boolean(message) },
    ip: input.actor.ip ?? null,
  })
  const emails = sendable.map(row =>
    convocationEmail(ctx, {
      to: row.email,
      toUserId: row.userId,
      firstName: row.firstName,
      session,
      role: row.role,
      message,
    }),
  )
  return { emails, sent: sendable.length, skipped: ids.length - sendable.length }
}

/** The role of a person in the session, while the convocation is open. */
export async function setConvocationRole(
  db: DbOrTx,
  input: { id: string; role: StaffRole; actor: Actor },
): Promise<void> {
  const [row] = await db
    .select({ id: sessionStaff.id, status: sessionStaff.status, sessionStatus: campSessions.status })
    .from(sessionStaff)
    .innerJoin(campSessions, eq(campSessions.id, sessionStaff.sessionId))
    .where(eq(sessionStaff.id, input.id))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'Convocazione non trovata' })
  if (!isSessionEditable(row.sessionStatus)) throw createError({ statusCode: 409, message: SESSION_CLOSED })
  if (row.status === 'declined' || row.status === 'cancelled') {
    throw createError({ statusCode: 409, message: 'La convocazione è chiusa: aggiungi di nuovo la persona' })
  }
  await db.update(sessionStaff).set({ role: input.role }).where(eq(sessionStaff.id, row.id))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'convocation.role',
    entityType: 'session_staff',
    entityId: row.id,
    data: { role: input.role },
    ip: input.actor.ip ?? null,
  })
}

/** Who withdraws a convocation: a session move may come without an account (only the audit reads it). */
type CancelActor = Omit<Actor, 'userId'> & { userId: string | null }

/**
 * Cancels the person's request to sign a contract, if still pending, unless another accepted
 * convocation of theirs, in a session neither over nor cancelled, has the same contract: a request is
 * one per document and person, and a duplicated session keeps the contract of the original. The
 * request is locked first, so an acceptance in progress elsewhere is counted before deciding.
 */
async function releaseContract(db: DbOrTx, input: { documentId: string; userId: string }): Promise<void> {
  const [request] = await db
    .select({ id: signatureRequests.id })
    .from(signatureRequests)
    .where(
      and(
        eq(signatureRequests.documentId, input.documentId),
        eq(signatureRequests.userId, input.userId),
        eq(signatureRequests.status, 'pending'),
      ),
    )
    .for('update')
  if (!request) return
  const [stillNeeded] = await db
    .select({ id: sessionStaff.id })
    .from(sessionStaff)
    .innerJoin(campSessions, eq(campSessions.id, sessionStaff.sessionId))
    .where(
      and(
        eq(sessionStaff.userId, input.userId),
        eq(sessionStaff.status, 'accepted'),
        eq(campSessions.contractDocumentId, input.documentId),
        inArray(campSessions.status, SESSION_EDITABLE_STATUSES),
      ),
    )
    .limit(1)
  if (stillNeeded) return
  await db.update(signatureRequests).set({ status: 'cancelled' }).where(eq(signatureRequests.id, request.id))
}

/**
 * Withdraws a convocation. A draft (never sent) is simply removed. A sent or accepted one becomes
 * `cancelled` with `staff.convocation_cancelled`; the contract request still to sign is cancelled too,
 * unless another convocation of the person still needs it (releaseContract).
 */
export async function cancelConvocation(
  db: DbOrTx,
  ctx: EmailContext,
  input: { id: string; actor: CancelActor; sessionCancelled?: boolean },
): Promise<{ emails: EmailMessage[]; removed: boolean }> {
  const [row] = await db
    .select({
      convocation: sessionStaff,
      session: campSessions,
      email: users.email,
      firstName: users.firstName,
      accountStatus: users.status,
    })
    .from(sessionStaff)
    .innerJoin(campSessions, eq(campSessions.id, sessionStaff.sessionId))
    .innerJoin(users, eq(users.id, sessionStaff.userId))
    .where(eq(sessionStaff.id, input.id))
    .limit(1)
    .for('update', { of: sessionStaff })
  if (!row) throw createError({ statusCode: 404, message: 'Convocazione non trovata' })
  const { convocation, session } = row
  if (!isSessionEditable(session.status)) throw createError({ statusCode: 409, message: SESSION_CLOSED })
  if (convocation.status === 'declined' || convocation.status === 'cancelled') {
    throw createError({ statusCode: 409, message: 'Questa convocazione è già chiusa' })
  }
  const audit = {
    actorUserId: input.actor.userId,
    entityType: 'session_staff',
    entityId: convocation.id,
    data: { sessionId: session.id, userId: convocation.userId, from: convocation.status },
    ip: input.actor.ip ?? null,
  }
  if (convocation.status === 'draft') {
    await db.delete(sessionStaff).where(eq(sessionStaff.id, convocation.id))
    await writeAudit(db, { ...audit, action: 'convocation.remove' })
    return { emails: [], removed: true }
  }
  await db
    .update(sessionStaff)
    .set({ status: 'cancelled', ...LEAVE_SESSION })
    .where(eq(sessionStaff.id, convocation.id))
  if (convocation.status === 'accepted' && session.contractDocumentId) {
    await releaseContract(db, { documentId: session.contractDocumentId, userId: convocation.userId })
  }
  await writeAudit(db, { ...audit, action: 'convocation.cancel' })
  if (row.accountStatus === 'disabled') return { emails: [], removed: false }
  return {
    emails: [
      convocationCancelledEmail(ctx, {
        to: row.email,
        toUserId: convocation.userId,
        firstName: row.firstName,
        session,
        role: convocation.role,
        sessionCancelled: input.sessionCancelled,
      }),
    ],
    removed: false,
  }
}

/** Convocations a cancelled session withdraws. */

/**
 * The session is being cancelled (server/domain/sessions.ts, transitionSession, before the status
 * changes): every convocation still open is withdrawn as cancelConvocation does one by one.
 */
export async function cancelSessionConvocations(
  db: DbOrTx,
  ctx: EmailContext,
  input: { sessionId: string; actor: CancelActor },
): Promise<EmailMessage[]> {
  const rows = await db
    .select({ id: sessionStaff.id })
    .from(sessionStaff)
    .where(and(eq(sessionStaff.sessionId, input.sessionId), inArray(sessionStaff.status, OPEN_CONVOCATIONS)))
    .for('update')
  const emails: EmailMessage[] = []
  for (const row of rows) {
    const result = await cancelConvocation(db, ctx, { id: row.id, actor: input.actor, sessionCancelled: true })
    emails.push(...result.emails)
  }
  return emails
}

/** The `staff.convocation_cancelled` emails cancelSessionConvocations would send now (the preview of the move). */
export async function sessionConvocationNotices(db: DbOrTx, sessionId: string): Promise<number> {
  const rows = await db
    .select({ id: sessionStaff.id })
    .from(sessionStaff)
    .innerJoin(users, eq(users.id, sessionStaff.userId))
    .where(
      and(
        eq(sessionStaff.sessionId, sessionId),
        inArray(sessionStaff.status, ['sent', 'accepted']),
        ne(users.status, 'disabled'),
      ),
    )
  return rows.length
}

const ALREADY_ANSWERED: Record<ConvocationStatus, string> = {
  draft: 'Convocazione non trovata',
  sent: '',
  accepted: 'Hai già accettato questa convocazione',
  declined: 'Hai già rifiutato questa convocazione',
  cancelled: 'Questa convocazione è stata annullata',
}

/**
 * The staff member answers a sent convocation. Accepting, when the session has a contract that is not
 * archived, creates the signature request (requestSignatures) and returns its email; the request to
 * open on /firma/:id is returned too (also when it already existed).
 */
export async function answerConvocation(
  db: DbOrTx,
  ctx: EmailContext,
  input: { id: string; userId: string; answer: 'accept' | 'decline'; reason?: string | null; ip?: string | null },
): Promise<{ emails: EmailMessage[]; signatureRequestId: string | null }> {
  const [row] = await db
    .select({ convocation: sessionStaff, session: campSessions })
    .from(sessionStaff)
    .innerJoin(campSessions, eq(campSessions.id, sessionStaff.sessionId))
    .where(and(eq(sessionStaff.id, input.id), eq(sessionStaff.userId, input.userId)))
    .limit(1)
    .for('update', { of: sessionStaff })
  if (!row || row.convocation.status === 'draft') {
    throw createError({ statusCode: 404, message: 'Convocazione non trovata' })
  }
  const { convocation, session } = row
  if (convocation.status !== 'sent') {
    throw createError({ statusCode: 409, message: ALREADY_ANSWERED[convocation.status] })
  }
  if (!isSessionEditable(session.status)) {
    throw createError({ statusCode: 409, message: 'La sessione è conclusa o annullata: non serve più rispondere' })
  }
  const profile = await profileOf(db, input.userId)
  if (profile.status !== 'approved') {
    throw createError({ statusCode: 403, message: 'Il tuo profilo non è attivo: scrivi all’amministrazione del camp' })
  }
  const accept = input.answer === 'accept'
  await db
    .update(sessionStaff)
    .set({
      status: accept ? 'accepted' : 'declined',
      respondedAt: new Date(),
      declineReason: accept ? null : input.reason?.trim() || null,
      // Who declines leads no activity group and sleeps in no lodging.
      ...(!accept && LEAVE_SESSION),
    })
    .where(eq(sessionStaff.id, convocation.id))
  await writeAudit(db, {
    actorUserId: input.userId,
    action: accept ? 'convocation.accept' : 'convocation.decline',
    entityType: 'session_staff',
    entityId: convocation.id,
    data: { sessionId: session.id },
    ip: input.ip ?? null,
  })
  if (!accept || !session.contractDocumentId) return { emails: [], signatureRequestId: null }
  // An archived document is never requested (locked as the documents area does when assigning).
  const [contract] = await db
    .select({ archivedAt: documents.archivedAt })
    .from(documents)
    .where(eq(documents.id, session.contractDocumentId))
    .for('share')
  if (!contract || contract.archivedAt) return { emails: [], signatureRequestId: null }

  const created = await requestSignatures(db, {
    documentId: session.contractDocumentId,
    userIds: [input.userId],
    sessionId: session.id,
  })
  const emails = await signatureRequestEmails(
    db,
    ctx,
    created.map(request => request.id),
  )
  const [request] = await db
    .select({ id: signatureRequests.id, status: signatureRequests.status })
    .from(signatureRequests)
    .where(
      and(eq(signatureRequests.documentId, session.contractDocumentId), eq(signatureRequests.userId, input.userId)),
    )
    .limit(1)
  return { emails, signatureRequestId: request?.status === 'pending' ? request.id : null }
}

// ─── Reads: administration ─────────────────────────────────────────────────────────────────────────

/**
 * Every staff account with its application, for /admin/staff: how many sessions not started yet each
 * person can come to and, with `sessionId`, whether they can come to that one (P1: filter by session).
 */
export async function staffList(
  db: DbOrTx,
  options: { today?: string; sessionId?: string } = {},
): Promise<StaffListItem[]> {
  const today = options.today ?? todayIso()
  const session = options.sessionId ? await sessionFor(db, options.sessionId) : null
  const people = db
    .select({
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      accountStatus: users.status,
      status: staffProfiles.status,
      team: staffProfiles.team,
      roles: staffProfiles.roles,
      city: staffProfiles.city,
      appliedAt: staffProfiles.appliedAt,
    })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .orderBy(asc(users.lastName), asc(users.firstName))
  const answered = db
    .select({ userId: sessionAvailability.userId, count: sql<number>`count(*)::int` })
    .from(sessionAvailability)
    .innerJoin(campSessions, eq(campSessions.id, sessionAvailability.sessionId))
    .where(openForAvailability(today))
    .groupBy(sessionAvailability.userId)
  const [rows, counts, forSession] = await Promise.all([
    people,
    answered,
    session ? availableFor(db, session.id) : null,
  ])
  const countOf = new Map(counts.map(row => [row.userId, row.count]))
  return rows.map(row => ({
    ...row,
    appliedAt: iso(row.appliedAt),
    availableSessions: countOf.get(row.userId) ?? 0,
    available: forSession ? forSession.has(row.userId) : null,
  }))
}

/** The people who said they can come to a session. */
async function availableFor(db: DbOrTx, sessionId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: sessionAvailability.userId })
    .from(sessionAvailability)
    .where(eq(sessionAvailability.sessionId, sessionId))
  return new Set(rows.map(row => row.userId))
}

/** Personal documents of an account, newest first. */
export async function staffDocuments(db: DbOrTx, userId: string): Promise<StaffDocumentDto[]> {
  const rows = await db
    .select({ document: personalDocuments, file: files })
    .from(personalDocuments)
    .innerJoin(files, eq(files.id, personalDocuments.fileId))
    .where(eq(personalDocuments.userId, userId))
    .orderBy(desc(personalDocuments.createdAt))
  return rows.map(({ document, file }) => ({
    id: document.id,
    title: document.title,
    category: document.category,
    file: toFileDto(file),
    createdAt: document.createdAt.toISOString(),
  }))
}

/** The page of one person: contacts, application, review, availability, convocations, documents. */
export async function staffDetail(db: DbOrTx, userId: string): Promise<StaffDetail> {
  const reviewer = alias(users, 'reviewer')
  const [row] = await db
    .select({
      user: users,
      profile: staffProfiles,
      cv: files,
      reviewerFirstName: reviewer.firstName,
      reviewerLastName: reviewer.lastName,
    })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .leftJoin(files, eq(files.id, staffProfiles.cvFileId))
    .leftJoin(reviewer, eq(reviewer.id, staffProfiles.reviewedBy))
    .where(eq(staffProfiles.userId, userId))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'Persona dello staff non trovata' })
  const { user, profile, cv } = row

  const availability: AvailabilitySession[] = await db
    .select(availabilitySession)
    .from(sessionAvailability)
    .innerJoin(campSessions, eq(campSessions.id, sessionAvailability.sessionId))
    .where(and(eq(sessionAvailability.userId, userId), ne(campSessions.status, 'cancelled')))
    .orderBy(asc(campSessions.startDate))

  const convocationRows = await db
    .select({
      convocation: sessionStaff,
      session: {
        id: campSessions.id,
        title: campSessions.title,
        status: campSessions.status,
        startDate: campSessions.startDate,
        endDate: campSessions.endDate,
        contractDocumentId: campSessions.contractDocumentId,
      },
    })
    .from(sessionStaff)
    .innerJoin(campSessions, eq(campSessions.id, sessionStaff.sessionId))
    .where(eq(sessionStaff.userId, userId))
    .orderBy(desc(campSessions.startDate))
  const requests = await contractRequests(
    db,
    convocationRows.flatMap(({ session }) =>
      session.contractDocumentId ? [{ documentId: session.contractDocumentId, userId }] : [],
    ),
  )
  const convocations: StaffConvocationSummary[] = convocationRows.map(({ convocation, session }) => {
    const contract = contractState(session.contractDocumentId, requests.get(`${session.contractDocumentId}:${userId}`))
    return {
      id: convocation.id,
      sessionId: session.id,
      sessionTitle: session.title,
      sessionStatus: session.status,
      startDate: session.startDate,
      endDate: session.endDate,
      role: convocation.role,
      status: convocation.status,
      sentAt: iso(convocation.sentAt),
      respondedAt: iso(convocation.respondedAt),
      declineReason: convocation.declineReason,
      contract,
      confirmed: isConfirmed(convocation.status, contract),
    }
  })

  const template = outcomeTemplate(profile.status)
  const [lastOutcome] = template
    ? await db
        .select({ createdAt: emailLog.createdAt })
        .from(emailLog)
        .where(and(eq(emailLog.toUserId, userId), eq(emailLog.template, template), ne(emailLog.status, 'failed')))
        .orderBy(desc(emailLog.createdAt))
        .limit(1)
    : []

  return {
    userId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    accountStatus: user.status,
    createdAt: user.createdAt.toISOString(),
    status: profile.status,
    team: profile.team,
    birthDate: profile.birthDate,
    city: profile.city,
    roles: profile.roles,
    qualifications: profile.qualifications,
    experience: profile.experience,
    motivation: profile.motivation,
    cv: cv ? toFileDto(cv) : null,
    appliedAt: iso(profile.appliedAt),
    reviewedAt: iso(profile.reviewedAt),
    reviewedByName: row.reviewerFirstName ? `${row.reviewerFirstName} ${row.reviewerLastName ?? ''}`.trim() : null,
    reviewNotes: profile.reviewNotes,
    availability,
    convocations,
    documents: await staffDocuments(db, userId),
    outcome: {
      template,
      subject: template ? outcomeSubject(template) : '',
      defaultMessage: template ? defaultOutcomeMessage(template) : '',
      sentAt: iso(lastOutcome?.createdAt),
    },
  }
}

const STATUS_ORDER: Record<ConvocationStatus, number> = { draft: 0, sent: 1, accepted: 2, declined: 3, cancelled: 4 }
const TEAM_ORDER: Record<StaffTeam, number> = { staff: 0, volunteer: 1 }

/**
 * The Staff tab of a session: its convocations, and the approved people who can still be added, only
 * those who said they can come to it (spec 3.5). The server does not refuse the others: the rule is
 * about what the administration is offered, a convocation stays its decision.
 */
export async function sessionStaffData(db: DbOrTx, sessionId: string): Promise<SessionStaffData> {
  const [row] = await db
    .select({ session: campSessions, contractTitle: documents.title })
    .from(campSessions)
    .leftJoin(documents, eq(documents.id, campSessions.contractDocumentId))
    .where(eq(campSessions.id, sessionId))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'Sessione non trovata' })
  const { session } = row

  const [convocationRows, availablePeople, availableIds] = await Promise.all([
    db
      .select({
        convocation: sessionStaff,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        accountStatus: users.status,
        profileStatus: staffProfiles.status,
        team: staffProfiles.team,
        staffRoles: staffProfiles.roles,
      })
      .from(sessionStaff)
      .innerJoin(users, eq(users.id, sessionStaff.userId))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, sessionStaff.userId))
      .where(eq(sessionStaff.sessionId, sessionId))
      .orderBy(asc(users.lastName), asc(users.firstName)),
    // Approved people who said they can come to this session.
    db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        team: staffProfiles.team,
        roles: staffProfiles.roles,
        city: staffProfiles.city,
      })
      .from(staffProfiles)
      .innerJoin(users, eq(users.id, staffProfiles.userId))
      .innerJoin(
        sessionAvailability,
        and(eq(sessionAvailability.userId, staffProfiles.userId), eq(sessionAvailability.sessionId, sessionId)),
      )
      .where(and(eq(staffProfiles.status, 'approved'), ne(users.status, 'disabled')))
      .orderBy(asc(users.lastName), asc(users.firstName)),
    availableFor(db, sessionId),
  ])

  const contractId = session.contractDocumentId
  const requests = contractId
    ? await contractRequests(
        db,
        convocationRows.map(r => ({ documentId: contractId, userId: r.convocation.userId })),
      )
    : new Map<string, { id: string; status: SignatureStatus }>()

  const convocations: SessionConvocation[] = convocationRows
    .map(({ convocation, ...person }) => {
      const contract = contractState(contractId, requests.get(`${contractId}:${convocation.userId}`))
      return {
        id: convocation.id,
        userId: convocation.userId,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        team: person.team ?? 'staff',
        staffRoles: person.staffRoles ?? [],
        role: convocation.role,
        status: convocation.status,
        message: convocation.message,
        sentAt: iso(convocation.sentAt),
        respondedAt: iso(convocation.respondedAt),
        declineReason: convocation.declineReason,
        available: availableIds.has(convocation.userId),
        contract,
        confirmed: isConfirmed(convocation.status, contract),
        // Whether the next email reaches the person: the convocation needs approved staff, the notice
        // of its cancellation only an account that is not disabled (cancelConvocation).
        sendable:
          person.accountStatus !== 'disabled' &&
          (convocation.status !== 'draft' || person.profileStatus === 'approved'),
      }
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || TEAM_ORDER[a.team] - TEAM_ORDER[b.team])

  const open = new Set(convocations.filter(c => OPEN_CONVOCATIONS.includes(c.status)).map(c => c.userId))
  const previous = new Map(
    convocations.flatMap(c => (c.status === 'declined' || c.status === 'cancelled' ? [[c.userId, c.status]] : [])) as [
      string,
      'declined' | 'cancelled',
    ][],
  )
  const available: AvailableStaff[] = availablePeople
    .filter(person => !open.has(person.userId))
    .map(person => ({ ...person, previousStatus: previous.get(person.userId) ?? null }))
    .sort((a, b) => TEAM_ORDER[a.team] - TEAM_ORDER[b.team])

  return {
    session: {
      id: session.id,
      title: session.title,
      startDate: session.startDate,
      endDate: session.endDate,
      status: session.status,
      staffNeeded: session.staffNeeded,
      editable: isSessionEditable(session.status),
      contract: contractId ? { id: contractId, title: row.contractTitle ?? 'Contratto' } : null,
    },
    counts: {
      confirmed: convocations.filter(c => c.confirmed).length,
      accepted: convocations.filter(c => c.status === 'accepted').length,
      waiting: convocations.filter(c => c.status === 'sent').length,
      draft: convocations.filter(c => c.status === 'draft').length,
      declined: convocations.filter(c => c.status === 'declined').length,
    },
    convocations,
    available,
  }
}

// ─── Reads: staff side ─────────────────────────────────────────────────────────────────────────────

/** The application of the signed-in person. */
export async function myApplication(db: DbOrTx, userId: string): Promise<StaffApplicationDto> {
  const [row] = await db
    .select({ profile: staffProfiles, cv: files })
    .from(staffProfiles)
    .leftJoin(files, eq(files.id, staffProfiles.cvFileId))
    .where(eq(staffProfiles.userId, userId))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'Profilo staff non trovato' })
  const { profile, cv } = row
  return {
    status: profile.status,
    editable: profile.status === 'registered',
    team: profile.team,
    birthDate: profile.birthDate,
    city: profile.city,
    roles: profile.roles,
    qualifications: profile.qualifications,
    experience: profile.experience,
    motivation: profile.motivation,
    cv: cv ? toFileDto(cv) : null,
    appliedAt: iso(profile.appliedAt),
  }
}

/**
 * The sessions availability is asked for, by date, with the person's answer: approved staff only. A
 * session they are convoked to (sent or accepted) says so.
 */
export async function myAvailability(
  db: DbOrTx,
  profile: Pick<ProfileRow, 'userId' | 'status'>,
  today: string = todayIso(),
): Promise<MyAvailability> {
  // Only approved staff see the sessions: before approval (or after a rejection) they are not theirs to know.
  if (profile.status !== 'approved') return { canEdit: false, sessions: [] }
  const rows = await db
    .select({ session: availabilitySession, answer: sessionAvailability.id, convocation: sessionStaff.status })
    .from(campSessions)
    .leftJoin(
      sessionAvailability,
      and(eq(sessionAvailability.sessionId, campSessions.id), eq(sessionAvailability.userId, profile.userId)),
    )
    .leftJoin(sessionStaff, and(eq(sessionStaff.sessionId, campSessions.id), eq(sessionStaff.userId, profile.userId)))
    .where(openForAvailability(today))
    .orderBy(asc(campSessions.startDate))
  return {
    canEdit: true,
    sessions: rows.map(row => ({
      ...row.session,
      available: row.answer !== null,
      convoked: row.convocation === 'sent' || row.convocation === 'accepted',
    })),
  }
}

/**
 * The convocations of the signed-in person (never the drafts), by session date. Only approved staff can
 * answer: an inactive person still sees them, without the buttons.
 */
export async function myConvocations(
  db: DbOrTx,
  userId: string,
  options: { approved: boolean },
): Promise<MyConvocation[]> {
  const rows = await db
    .select({
      convocation: sessionStaff,
      session: {
        id: campSessions.id,
        title: campSessions.title,
        description: campSessions.description,
        location: campSessions.location,
        startDate: campSessions.startDate,
        endDate: campSessions.endDate,
        status: campSessions.status,
        contractDocumentId: campSessions.contractDocumentId,
      },
      contractTitle: documents.title,
    })
    .from(sessionStaff)
    .innerJoin(campSessions, eq(campSessions.id, sessionStaff.sessionId))
    .leftJoin(documents, eq(documents.id, campSessions.contractDocumentId))
    .where(and(eq(sessionStaff.userId, userId), ne(sessionStaff.status, 'draft')))
    .orderBy(asc(campSessions.startDate))
  const requests = await contractRequests(
    db,
    rows.flatMap(({ session }) =>
      session.contractDocumentId ? [{ documentId: session.contractDocumentId, userId }] : [],
    ),
  )
  return rows.map(({ convocation, session, contractTitle }) => {
    const { contractDocumentId, ...sessionFields } = session
    const request = contractDocumentId ? requests.get(`${contractDocumentId}:${userId}`) : undefined
    const contract = contractState(contractDocumentId, request)
    return {
      id: convocation.id,
      session: sessionFields,
      role: convocation.role,
      status: convocation.status,
      message: convocation.message,
      sentAt: iso(convocation.sentAt),
      respondedAt: iso(convocation.respondedAt),
      declineReason: convocation.declineReason,
      contract,
      contractRequestId: request?.status === 'pending' ? request.id : null,
      contractTitle: contractTitle ?? null,
      confirmed: isConfirmed(convocation.status, contract),
      answerable: options.approved && convocation.status === 'sent' && isSessionEditable(session.status),
    }
  })
}

/** The home of the signed-in staff member, whatever the status of the application. */
export async function staffHome(db: DbOrTx, profile: ProfileRow, today: string = todayIso()): Promise<StaffHome> {
  const [convocations, { sessions }] = await Promise.all([
    myConvocations(db, profile.userId, { approved: profile.status === 'approved' }),
    myAvailability(db, profile, today),
  ])
  const available = sessions.filter(session => session.available).length
  return {
    status: profile.status,
    appliedAt: iso(profile.appliedAt),
    missing: profile.status === 'registered' ? applicationMissing(profile) : [],
    toAnswer: convocations.filter(c => c.answerable),
    upcoming: convocations.filter(
      c => c.status === 'accepted' && c.session.endDate >= today && c.session.status !== 'cancelled',
    ),
    availability: { available, total: sessions.length },
  }
}
