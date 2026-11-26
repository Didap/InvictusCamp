// The automatic emails (Comunicazioni › Automatiche): the texts the administration wrote, the switch that
// stops an email's event from sending it, the preview with example data and the send by hand. The catalog
// (what each email is, its fields, its defaults) is shared/utils/automatic-emails.ts; the templates render
// through server/emails/automatic.ts with the texts loaded here into the EmailContext.
import { and, eq } from 'drizzle-orm'
import type { AutomaticEmailDetail, AutomaticEmailState } from '../../shared/types/automatic-emails'
import type { Audience } from '../../shared/types/domain'
import {
  AUTOMATIC_EMAIL_KEYS,
  automaticEmailDefinition,
  isAutomaticEmailKey,
  type AutomaticEmailKey,
  type EmailTexts,
  type EmailTextsByKey,
} from '../../shared/utils/automatic-emails'
import { fullName } from '../../shared/utils/format'
import { sameContent } from '../../shared/utils/plain'
import { automaticEmails, campSessions, emailLog, users } from '../db/schema'
import { inviteEmail, resetPasswordEmail, verifyEmailEmail } from '../emails/auth'
import { signatureSignedEmail } from '../emails/documents'
import { guestAgeEmail } from '../emails/families'
import { familySessionEmail, type SessionEmailFacts, type SessionEmailKey } from '../emails/sessions'
import { documentRequestEmail, signatureOtpEmail } from '../emails/signatures'
import {
  availabilityReopenedEmail,
  convocationCancelledEmail,
  convocationEmail,
  outcomeProposal,
  staffOutcomeEmail,
} from '../emails/staff'
import type { EmailContext, EmailMessage } from '../emails/types'
import { resolveAudience } from './audiences'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { EMAIL_OFF } from './email-quota'
import { createError } from './errors'

const canSwitchOff = (key: string) => isAutomaticEmailKey(key) && !automaticEmailDefinition(key).alwaysOn

/** The texts the administration changed and the emails it switched off, for the EmailContext of every send. */
export async function loadEmailSettings(db: DbOrTx): Promise<{ texts: EmailTextsByKey; off: Set<string> }> {
  const rows = await db
    .select({ key: automaticEmails.key, active: automaticEmails.active, texts: automaticEmails.texts })
    .from(automaticEmails)
  const texts: EmailTextsByKey = {}
  const off = new Set<string>()
  for (const row of rows) {
    if (row.texts && isAutomaticEmailKey(row.key)) texts[row.key] = row.texts
    if (!row.active && canSwitchOff(row.key)) off.add(row.key)
  }
  return { texts, off }
}

// ─── The page ──────────────────────────────────────────────────────────────────────────────────────

interface Row {
  key: string
  active: boolean
  texts: EmailTexts | null
  updatedAt: Date
  firstName: string | null
  lastName: string | null
}

async function rows(db: DbOrTx, key?: AutomaticEmailKey): Promise<Map<string, Row>> {
  const found = await db
    .select({
      key: automaticEmails.key,
      active: automaticEmails.active,
      texts: automaticEmails.texts,
      updatedAt: automaticEmails.updatedAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(automaticEmails)
    .leftJoin(users, eq(users.id, automaticEmails.updatedBy))
    .where(key ? eq(automaticEmails.key, key) : undefined)
  return new Map(found.map(row => [row.key, row]))
}

function stateOf(key: AutomaticEmailKey, row: Row | undefined): AutomaticEmailState {
  return {
    key,
    active: Boolean(automaticEmailDefinition(key).alwaysOn) || (row?.active ?? true),
    customized: Boolean(row?.texts),
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedByName: row?.firstName ? fullName({ firstName: row.firstName, lastName: row.lastName ?? '' }) : null,
  }
}

export async function listAutomaticEmails(db: DbOrTx): Promise<AutomaticEmailState[]> {
  const found = await rows(db)
  return AUTOMATIC_EMAIL_KEYS.map(key => stateOf(key, found.get(key)))
}

export async function automaticEmailDetail(db: DbOrTx, key: AutomaticEmailKey): Promise<AutomaticEmailDetail> {
  const row = (await rows(db, key)).get(key)
  return { ...stateOf(key, row), texts: row?.texts ?? automaticEmailDefinition(key).defaults }
}

/**
 * Saves the texts of an email; texts equal to the defaults are stored as no change. `updatedAt`: when the page
 * read it (null if never changed); someone else having saved since is a 409, as for the other shared texts.
 */
export async function saveEmailTexts(
  db: DbOrTx,
  input: { key: AutomaticEmailKey; texts: EmailTexts; actorId: string; updatedAt?: string | null },
): Promise<void> {
  if (input.updatedAt !== undefined) {
    const [row] = await db
      .select({ updatedAt: automaticEmails.updatedAt })
      .from(automaticEmails)
      .where(eq(automaticEmails.key, input.key))
      .for('update')
    if ((row?.updatedAt.toISOString() ?? null) !== input.updatedAt) {
      throw createError({
        statusCode: 409,
        message: 'Qualcuno ha cambiato questa email mentre la scrivevi: ricarica la pagina e riprova.',
      })
    }
  }
  const texts = sameContent(input.texts, automaticEmailDefinition(input.key).defaults) ? null : input.texts
  await db
    .insert(automaticEmails)
    .values({ key: input.key, texts, updatedBy: input.actorId })
    .onConflictDoUpdate({ target: automaticEmails.key, set: { texts, updatedBy: input.actorId } })
  await writeAudit(db, {
    actorUserId: input.actorId,
    action: texts ? 'email.texts' : 'email.texts_reset',
    entityType: 'automatic_email',
    data: { key: input.key },
  })
}

/**
 * Switches an email on or off. Off, the ones of its kind still waiting in the queue stay there as disabled too:
 * returns how many. Access links, codes and the outcomes sent by hand cannot be switched off.
 */
export async function setEmailActive(
  db: DbOrTx,
  input: { key: AutomaticEmailKey; active: boolean; actorId: string },
): Promise<number> {
  const reason = automaticEmailDefinition(input.key).alwaysOn
  if (reason && !input.active) {
    throw createError({ statusCode: 409, message: `Questa email non si può spegnere. ${reason}` })
  }
  await db
    .insert(automaticEmails)
    .values({ key: input.key, active: input.active, updatedBy: input.actorId })
    .onConflictDoUpdate({ target: automaticEmails.key, set: { active: input.active, updatedBy: input.actorId } })
  await writeAudit(db, {
    actorUserId: input.actorId,
    action: 'email.active',
    entityType: 'automatic_email',
    data: { key: input.key, active: input.active },
  })
  if (input.active) return 0
  const held = await db
    .update(emailLog)
    .set({ status: 'disabled', error: EMAIL_OFF, textBody: null })
    .where(and(eq(emailLog.template, input.key), eq(emailLog.status, 'queued')))
    .returning({ id: emailLog.id })
  return held.length
}

// ─── Example and send by hand ──────────────────────────────────────────────────────────────────────

export interface EmailRecipient {
  to: string
  toUserId: string
  firstName: string
}

const EXAMPLE_ID = '00000000-0000-4000-8000-000000000000'
const EXAMPLE_SESSION: SessionEmailFacts = {
  id: EXAMPLE_ID,
  title: 'Sessione di luglio',
  location: 'Maruggio (TA)',
  startDate: '2027-07-05',
  endDate: '2027-07-11',
  responseDeadline: '2027-05-31',
}
const EXAMPLE_DOCUMENT = { documentTitle: 'Liberatoria per le foto', requestId: EXAMPLE_ID, dueDate: '2027-06-15' }
const EXAMPLE_CONVOCATION = { session: EXAMPLE_SESSION, roleName: 'Educatore' }
const EXAMPLE_TOKEN = 'esempio'

const session = (key: SessionEmailKey) => (ctx: EmailContext, r: EmailRecipient) =>
  familySessionEmail(ctx, key, r, EXAMPLE_SESSION)
const document = (requiresSignature: boolean, reminder: boolean) => (ctx: EmailContext, r: EmailRecipient) =>
  documentRequestEmail(ctx, { ...r, ...EXAMPLE_DOCUMENT, requiresSignature, reminder })
const outcome = (template: 'staff.approved' | 'staff.rejected') => (ctx: EmailContext, r: EmailRecipient) =>
  staffOutcomeEmail(ctx, { ...r, template, message: outcomeProposal(ctx.texts, template, r.firstName).message })

/** Every email built by its real template, with example data. */
const EXAMPLES: Record<AutomaticEmailKey, (ctx: EmailContext, recipient: EmailRecipient) => EmailMessage> = {
  'session.invite': session('session.invite'),
  'session.invite_reminder': session('session.invite_reminder'),
  'session.reserve': session('session.reserve'),
  'session.slot_offered': session('session.slot_offered'),
  'session.confirmed': session('session.confirmed'),
  'session.cancelled': session('session.cancelled'),
  'session.removed': session('session.removed'),
  'session.reserve_removed': session('session.reserve_removed'),
  'session.feedback': session('session.feedback'),
  'family.age_notice': (ctx, r) => guestAgeEmail(ctx, r),
  'staff.convocation': (ctx, r) => convocationEmail(ctx, { ...r, ...EXAMPLE_CONVOCATION }),
  'staff.convocation_cancelled': (ctx, r) => convocationCancelledEmail(ctx, { ...r, ...EXAMPLE_CONVOCATION }),
  'staff.session_cancelled': (ctx, r) =>
    convocationCancelledEmail(ctx, { ...r, ...EXAMPLE_CONVOCATION, sessionCancelled: true }),
  'staff.availability_reopened': (ctx, r) => availabilityReopenedEmail(ctx, r),
  'staff.approved': outcome('staff.approved'),
  'staff.rejected': outcome('staff.rejected'),
  'signature.request': document(true, false),
  'signature.reminder': document(true, true),
  'document.read': document(false, false),
  'document.read_reminder': document(false, true),
  'signature.signed': (ctx, r) => signatureSignedEmail(ctx, { ...r, ...EXAMPLE_DOCUMENT, signedAt: new Date() }),
  'signature.otp': (ctx, r) => signatureOtpEmail(ctx, { ...r, ...EXAMPLE_DOCUMENT, code: '482915' }),
  'auth.invite_family': (ctx, r) => inviteEmail(ctx, { ...r, role: 'family', token: EXAMPLE_TOKEN }),
  'auth.invite_staff': (ctx, r) => inviteEmail(ctx, { ...r, role: 'staff', token: EXAMPLE_TOKEN }),
  'auth.invite_admin': (ctx, r) => inviteEmail(ctx, { ...r, role: 'admin', token: EXAMPLE_TOKEN }),
  'auth.verify_email': (ctx, r) => verifyEmailEmail(ctx, { ...r, token: EXAMPLE_TOKEN }),
  'auth.reset_password': (ctx, r) => resetPasswordEmail(ctx, { ...r, token: EXAMPLE_TOKEN }),
}

/**
 * The email as it leaves, with example data and the texts given (those being written in the page) or the
 * saved ones. Sent to `recipient` it is "Invia una prova a me": it leaves even when the email is off.
 */
export function exampleEmail(
  ctx: EmailContext,
  key: AutomaticEmailKey,
  recipient: EmailRecipient,
  texts?: EmailTexts,
): EmailMessage {
  // Never switched off; written with the texts given (the other emails' texts are not read).
  const context = { appUrl: ctx.appUrl, texts: texts ? { [key]: texts } : ctx.texts }
  // The example session does not exist: the log row of a test belongs to no session.
  return { ...EXAMPLES[key](context, recipient), sessionId: null }
}

/**
 * "Invia a mano": the email for each person of the audience, with the texts saved now and the session's facts.
 * It leaves even when its event no longer sends it.
 */
export async function manualEmails(
  db: DbOrTx,
  ctx: EmailContext,
  input: { key: AutomaticEmailKey; audience: Audience; actorId: string },
): Promise<EmailMessage[]> {
  const { key, audience } = input
  if (!automaticEmailDefinition(key).manual || audience.type !== 'session_families') {
    throw createError({ statusCode: 400, message: 'Questa email si manda a mano solo alle famiglie di una sessione.' })
  }
  const { recipients } = await resolveAudience(db, audience)
  const [facts] = await db
    .select({
      id: campSessions.id,
      title: campSessions.title,
      location: campSessions.location,
      startDate: campSessions.startDate,
      endDate: campSessions.endDate,
      responseDeadline: campSessions.responseDeadline,
    })
    .from(campSessions)
    .where(eq(campSessions.id, audience.sessionId))
    .limit(1)
  if (!facts) throw createError({ statusCode: 404, message: 'Sessione non trovata' })
  // Sent by hand: it leaves even when switched off.
  const context = { ...ctx, off: undefined }
  const messages = recipients.map(r =>
    familySessionEmail(
      context,
      key as SessionEmailKey,
      { to: r.email, toUserId: r.userId, firstName: r.firstName },
      facts,
    ),
  )
  await writeAudit(db, {
    actorUserId: input.actorId,
    action: 'email.manual_send',
    entityType: 'automatic_email',
    data: { key, audience, recipients: messages.length },
  })
  return messages
}
