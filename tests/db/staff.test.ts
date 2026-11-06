// The staff area against a real database (docs/spec.md 3.4, 3.5): the application, the review and its
// outcome email (never automatic), availability, convocations and the contract after an accepted one.
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  addAvailability,
  addConvocations,
  answerConvocation,
  approveApplications,
  cancelConvocation,
  cancelSessionConvocations,
  changeStaffStatus,
  myConvocations,
  removeAvailability,
  replaceCv,
  saveApplicationDraft,
  sendConvocations,
  sessionStaffData,
  setConvocationRole,
  staffDetail,
  staffHome,
  staffList,
  staffOutcomeEmails,
  submitApplication,
} from '../../server/domain/staff'
import type { Db } from '../../server/domain/db'
import { makeAdmin, makeDocument, makeSession, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx = { appUrl: 'https://gestionale.test' }
const TODAY = '2026-11-06'

const APPLICATION = {
  birthDate: '1995-04-10',
  city: 'Lecce',
  roles: ['educator', 'volunteer'] as ('educator' | 'volunteer')[],
  qualifications: 'Laurea in scienze dell’educazione',
  experience: 'Tre estati in un centro estivo inclusivo',
  motivation: 'Voglio esserci',
}

/** A file record without bytes (the domain never reads them here). */
async function makeFile(database: Db, ownerUserId: string) {
  const [file] = await database
    .insert(t.files)
    .values({
      storageKey: `test/${randomUUID()}.pdf`,
      originalName: 'cv.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
      purpose: 'cv',
      ownerUserId,
      uploadedBy: ownerUserId,
    })
    .returning()
  return file!
}

async function profileStatus(userId: string) {
  const [row] = await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.userId, userId))
  return row!
}

async function auditActions(entityId: string) {
  const rows = await db.select().from(t.auditLog).where(eq(t.auditLog.entityId, entityId))
  return rows.map(row => row.action)
}

async function convocation(id: string) {
  const [row] = await db.select().from(t.sessionStaff).where(eq(t.sessionStaff.id, id))
  return row
}

/** A session with `count` approved staff added as drafts. */
async function sessionWithDrafts(count: number, values: Partial<typeof t.campSessions.$inferInsert> = {}) {
  const admin = await makeAdmin(db)
  const session = await makeSession(db, values)
  const people = []
  for (let i = 0; i < count; i++) people.push(await makeStaff(db, 'approved'))
  await addConvocations(db, {
    sessionId: session.id,
    people: people.map(p => ({ userId: p.user.id, role: 'educator' as const })),
    actor: { userId: admin.id },
  })
  const rows = await db.select().from(t.sessionStaff).where(eq(t.sessionStaff.sessionId, session.id))
  return { admin, session, people, ids: rows.map(row => row.id) }
}

/** A sent convocation of one approved person. */
async function sentConvocation(values: Partial<typeof t.campSessions.$inferInsert> = {}) {
  const setup = await sessionWithDrafts(1, values)
  await sendConvocations(db, ctx, { sessionId: setup.session.id, ids: setup.ids, actor: { userId: setup.admin.id } })
  return { ...setup, id: setup.ids[0]!, person: setup.people[0]! }
}

/** One approved person convoked to a new session for each `values`, who accepts every convocation. */
async function acceptedInSessions(...values: Partial<typeof t.campSessions.$inferInsert>[]) {
  const actor = { userId: (await makeAdmin(db)).id }
  const { user } = await makeStaff(db, 'approved')
  const sessions = []
  const ids = []
  for (const value of values) {
    const session = await makeSession(db, value)
    await addConvocations(db, { sessionId: session.id, people: [{ userId: user.id, role: 'educator' }], actor })
    const [row] = await db.select().from(t.sessionStaff).where(eq(t.sessionStaff.sessionId, session.id))
    await sendConvocations(db, ctx, { sessionId: session.id, ids: [row!.id], actor })
    await answerConvocation(db, ctx, { id: row!.id, userId: user.id, answer: 'accept' })
    sessions.push(session)
    ids.push(row!.id)
  }
  return { actor, user, sessions, ids }
}

describe('application', () => {
  it('is saved as a draft, then sent once with the CV', async () => {
    const { user } = await makeStaff(db, 'registered')
    await saveApplicationDraft(db, user.id, { city: 'Lecce', roles: ['educator', 'educator'] })
    let profile = await profileStatus(user.id)
    expect(profile.city).toBe('Lecce')
    expect(profile.roles).toEqual(['educator'])
    expect(profile.status).toBe('registered')

    await expect(submitApplication(db, user.id, APPLICATION)).rejects.toMatchObject({ statusCode: 400 })
    const cv = await makeFile(db, user.id)
    expect(await replaceCv(db, user.id, cv.id)).toBeNull()
    await submitApplication(db, user.id, APPLICATION)

    profile = await profileStatus(user.id)
    expect(profile.status).toBe('applied')
    expect(profile.appliedAt).toBeInstanceOf(Date)
    expect(profile.roles).toEqual(['educator', 'volunteer'])
    expect(await auditActions(user.id)).toContain('staff.apply')
  })

  it('cannot change after it is sent', async () => {
    const { user } = await makeStaff(db, 'applied')
    await expect(saveApplicationDraft(db, user.id, { city: 'Bari' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(replaceCv(db, user.id, (await makeFile(db, user.id)).id)).rejects.toMatchObject({ statusCode: 409 })
    await expect(submitApplication(db, user.id, APPLICATION)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('replacing the CV returns the old one to delete', async () => {
    const { user } = await makeStaff(db, 'registered')
    const first = await makeFile(db, user.id)
    const second = await makeFile(db, user.id)
    await replaceCv(db, user.id, first.id)
    expect(await replaceCv(db, user.id, second.id)).toBe(first.id)
    expect((await profileStatus(user.id)).cvFileId).toBe(second.id)
  })

  it('the home lists what is missing while it is not sent', async () => {
    const { user, profile } = await makeStaff(db, 'registered')
    const home = await staffHome(db, profile, TODAY)
    expect(home.missing).toEqual([
      'Data di nascita',
      'Città',
      'Ruoli',
      'Titoli e qualifiche',
      'Esperienze',
      'Motivazione',
      'CV in PDF',
    ])
    await saveApplicationDraft(db, user.id, { city: 'Lecce', roles: ['oss'] })
    const after = await staffHome(db, await profileStatus(user.id), TODAY)
    expect(after.missing).not.toContain('Città')
    expect(after.missing).not.toContain('Ruoli')
  })
})

describe('review', () => {
  it('approves an application with notes and sends nothing', async () => {
    const admin = await makeAdmin(db)
    const { user } = await makeStaff(db, 'applied')
    await changeStaffStatus(db, {
      userId: user.id,
      status: 'approved',
      notes: ' Colloquio ok ',
      actor: { userId: admin.id },
    })
    const profile = await profileStatus(user.id)
    expect(profile.status).toBe('approved')
    expect(profile.reviewNotes).toBe('Colloquio ok')
    expect(profile.reviewedBy).toBe(admin.id)
    expect(profile.reviewedAt).toBeInstanceOf(Date)
    expect(await auditActions(user.id)).toEqual(['staff.review'])
    expect(await db.select().from(t.emailLog)).toHaveLength(0)
  })

  it('refuses the moves that are not allowed', async () => {
    const admin = await makeAdmin(db)
    const actor = { userId: admin.id }
    const registered = await makeStaff(db, 'registered')
    await expect(
      changeStaffStatus(db, { userId: registered.user.id, status: 'approved', actor }),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('non è ancora stata inviata') })
    const approved = await makeStaff(db, 'approved')
    await expect(changeStaffStatus(db, { userId: approved.user.id, status: 'rejected', actor })).rejects.toMatchObject({
      statusCode: 409,
    })
    const applied = await makeStaff(db, 'applied')
    await expect(changeStaffStatus(db, { userId: applied.user.id, status: 'inactive', actor })).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('a rejected application can still be approved; approved staff can be deactivated and reactivated', async () => {
    const admin = await makeAdmin(db)
    const actor = { userId: admin.id }
    const { user } = await makeStaff(db, 'applied')
    await changeStaffStatus(db, { userId: user.id, status: 'rejected', actor })
    await changeStaffStatus(db, { userId: user.id, status: 'approved', actor })
    const reviewedAt = (await profileStatus(user.id)).reviewedAt
    await changeStaffStatus(db, { userId: user.id, status: 'inactive', actor })
    await changeStaffStatus(db, { userId: user.id, status: 'approved', actor })
    const profile = await profileStatus(user.id)
    expect(profile.status).toBe('approved')
    expect(profile.reviewedAt).toEqual(reviewedAt)
    expect(await auditActions(user.id)).toEqual(['staff.review', 'staff.review', 'staff.status', 'staff.status'])
  })

  it('approves in bulk only the applications still waiting', async () => {
    const admin = await makeAdmin(db)
    const a = await makeStaff(db, 'applied')
    const b = await makeStaff(db, 'applied')
    const c = await makeStaff(db, 'rejected')
    const result = await approveApplications(db, {
      userIds: [a.user.id, b.user.id, c.user.id],
      actor: { userId: admin.id },
    })
    expect(result).toEqual({ approved: 2, skipped: 1 })
    expect((await profileStatus(a.user.id)).status).toBe('approved')
    expect((await profileStatus(c.user.id)).status).toBe('rejected')
  })

  it('the outcome email follows the status and leaves only on request', async () => {
    const admin = await makeAdmin(db)
    const actor = { userId: admin.id }
    const { user } = await makeStaff(db, 'applied')
    await expect(staffOutcomeEmails(db, ctx, { userId: user.id, message: 'Ciao', actor })).rejects.toMatchObject({
      statusCode: 409,
    })

    await changeStaffStatus(db, { userId: user.id, status: 'approved', actor })
    const [approved] = await staffOutcomeEmails(db, ctx, {
      userId: user.id,
      message: 'la tua candidatura è stata accettata.\n\nA presto <al> camp.',
      actor,
    })
    expect(approved).toMatchObject({ to: user.email, toUserId: user.id, template: 'staff.approved' })
    expect(approved!.html).toContain('A presto &lt;al&gt; camp.')
    expect(approved!.html).toContain('https://gestionale.test/staff')
    expect(approved!.sensitive).toBeFalsy()
    expect(await auditActions(user.id)).toContain('staff.outcome_sent')

    const other = await makeStaff(db, 'applied')
    await changeStaffStatus(db, { userId: other.user.id, status: 'rejected', actor })
    const [rejected] = await staffOutcomeEmails(db, ctx, { userId: other.user.id, message: 'Grazie.', actor })
    expect(rejected!.template).toBe('staff.rejected')

    await db.update(t.users).set({ status: 'disabled' }).where(eq(t.users.id, other.user.id))
    await expect(
      staffOutcomeEmails(db, ctx, { userId: other.user.id, message: 'Grazie.', actor }),
    ).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('the detail shows the notes, the proposed message and when the outcome was sent', async () => {
    const admin = await makeAdmin(db)
    const { user } = await makeStaff(db, 'applied')
    await changeStaffStatus(db, {
      userId: user.id,
      status: 'approved',
      notes: 'Nota interna',
      actor: { userId: admin.id },
    })
    let detail = await staffDetail(db, user.id)
    expect(detail.reviewNotes).toBe('Nota interna')
    expect(detail.reviewedByName).toBe('Giulia Conte')
    expect(detail.outcome).toMatchObject({ template: 'staff.approved', sentAt: null })
    expect(detail.outcome.defaultMessage.length).toBeGreaterThan(20)

    await db.insert(t.emailLog).values({
      template: 'staff.approved',
      toEmail: user.email,
      toUserId: user.id,
      subject: 'Esito',
      status: 'simulated',
    })
    detail = await staffDetail(db, user.id)
    expect(detail.outcome.sentAt).not.toBeNull()
  })
})

describe('availability', () => {
  it('only approved staff add and remove periods', async () => {
    const applied = await makeStaff(db, 'applied')
    const period = { startDate: '2027-06-01', endDate: '2027-06-30' }
    await expect(addAvailability(db, applied.user.id, period, TODAY)).rejects.toMatchObject({ statusCode: 403 })

    const approved = await makeStaff(db, 'approved')
    const added = await addAvailability(db, approved.user.id, { ...period, notes: ' Solo pomeriggio ' }, TODAY)
    expect(added).toMatchObject({ ...period, notes: 'Solo pomeriggio' })

    await db.update(t.staffProfiles).set({ status: 'inactive' }).where(eq(t.staffProfiles.userId, approved.user.id))
    await expect(removeAvailability(db, approved.user.id, added.id)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses periods already over, reversed or overlapping another', async () => {
    const { user } = await makeStaff(db, 'approved')
    await expect(
      addAvailability(db, user.id, { startDate: '2026-10-01', endDate: '2026-10-05' }, TODAY),
    ).rejects.toMatchObject({ statusCode: 400 })
    await expect(
      addAvailability(db, user.id, { startDate: '2027-06-10', endDate: '2027-06-01' }, TODAY),
    ).rejects.toMatchObject({ statusCode: 400 })
    await addAvailability(db, user.id, { startDate: '2027-06-01', endDate: '2027-06-30' }, TODAY)
    await expect(
      addAvailability(db, user.id, { startDate: '2027-06-30', endDate: '2027-07-10' }, TODAY),
    ).rejects.toMatchObject({ statusCode: 409 })
    // The day after is fine, and so is a period that started earlier but is not over.
    await addAvailability(db, user.id, { startDate: '2027-07-01', endDate: '2027-07-10' }, TODAY)
    await addAvailability(db, user.id, { startDate: '2026-11-01', endDate: '2026-11-30' }, TODAY)
  })

  it('a person removes only their own periods', async () => {
    const anna = await makeStaff(db, 'approved')
    const luca = await makeStaff(db, 'approved')
    const period = await addAvailability(db, anna.user.id, { startDate: '2027-06-01', endDate: '2027-06-30' }, TODAY)
    await expect(removeAvailability(db, luca.user.id, period.id)).rejects.toMatchObject({ statusCode: 404 })
    await removeAvailability(db, anna.user.id, period.id)
    expect(await db.select().from(t.staffAvailability)).toHaveLength(0)
  })

  it('the list shows the next period that has not ended', async () => {
    const { user } = await makeStaff(db, 'approved')
    await db.insert(t.staffAvailability).values([
      { userId: user.id, startDate: '2026-07-01', endDate: '2026-07-10' },
      { userId: user.id, startDate: '2027-08-01', endDate: '2027-08-10' },
      { userId: user.id, startDate: '2027-06-01', endDate: '2027-06-10' },
    ])
    const [row] = await staffList(db, { today: TODAY })
    expect(row!.nextAvailability).toEqual({ startDate: '2027-06-01', endDate: '2027-06-10' })
    expect(row!.coverage).toBeNull()
  })

  it('the list carries the coverage of a chosen session', async () => {
    const session = await makeSession(db, { startDate: '2027-06-21', endDate: '2027-06-27' })
    const full = await makeStaff(db, 'approved')
    const partial = await makeStaff(db, 'approved')
    await makeStaff(db, 'approved')
    await db.insert(t.staffAvailability).values([
      { userId: full.user.id, startDate: '2027-06-01', endDate: '2027-06-30' },
      { userId: partial.user.id, startDate: '2027-06-25', endDate: '2027-07-05' },
    ])
    const rows = await staffList(db, { today: TODAY, sessionId: session.id })
    const coverage = Object.fromEntries(rows.map(row => [row.userId, row.coverage]))
    expect(coverage[full.user.id]).toBe('full')
    expect(coverage[partial.user.id]).toBe('partial')
    expect(rows.filter(row => row.coverage === 'none')).toHaveLength(1)
    await expect(staffList(db, { sessionId: randomUUID() })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('convocations', () => {
  it('adds approved staff as drafts, once, and only while the session is open', async () => {
    const admin = await makeAdmin(db)
    const actor = { userId: admin.id }
    const session = await makeSession(db)
    const approved = await makeStaff(db, 'approved')
    const people = [{ userId: approved.user.id, role: 'nurse' as const }]
    expect(await addConvocations(db, { sessionId: session.id, people, actor })).toEqual({ added: 1, kept: 0 })
    expect(await addConvocations(db, { sessionId: session.id, people, actor })).toEqual({ added: 0, kept: 1 })
    const [row] = await db.select().from(t.sessionStaff)
    expect(row).toMatchObject({ status: 'draft', role: 'nurse', sentAt: null })

    const applied = await makeStaff(db, 'applied')
    await expect(
      addConvocations(db, { sessionId: session.id, people: [{ userId: applied.user.id, role: 'oss' }], actor }),
    ).rejects.toMatchObject({ statusCode: 409 })

    const closed = await makeSession(db, { status: 'completed' })
    await expect(addConvocations(db, { sessionId: closed.id, people, actor })).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('sends the chosen drafts, one email each with the message', async () => {
    const { admin, session, people, ids } = await sessionWithDrafts(2, { title: 'Sessione di luglio' })
    const result = await sendConvocations(db, ctx, {
      sessionId: session.id,
      ids,
      message: '  Ti aspettiamo.  ',
      actor: { userId: admin.id },
    })
    expect(result.sent).toBe(2)
    expect(result.emails.map(email => email.to).sort()).toEqual(people.map(p => p.user.email).sort())
    for (const email of result.emails) {
      expect(email).toMatchObject({ template: 'staff.convocation', sessionId: session.id })
      expect(email.html).toContain('Sessione di luglio')
      expect(email.html).toContain('Ti aspettiamo.')
      expect(email.html).toContain('https://gestionale.test/staff/convocazioni')
    }
    const row = await convocation(ids[0]!)
    expect(row).toMatchObject({ status: 'sent', message: 'Ti aspettiamo.' })
    expect(row!.sentAt).toBeInstanceOf(Date)

    await expect(
      sendConvocations(db, ctx, { sessionId: session.id, ids, actor: { userId: admin.id } }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('a draft of someone no longer approved is not sent', async () => {
    const { admin, session, people, ids } = await sessionWithDrafts(2)
    await db.update(t.staffProfiles).set({ status: 'inactive' }).where(eq(t.staffProfiles.userId, people[0]!.user.id))
    const result = await sendConvocations(db, ctx, { sessionId: session.id, ids, actor: { userId: admin.id } })
    expect(result).toMatchObject({ sent: 1, skipped: 1 })
    const data = await sessionStaffData(db, session.id)
    expect(data.convocations.find(c => c.userId === people[0]!.user.id)).toMatchObject({
      status: 'draft',
      sendable: false,
    })
  })

  it('ids from another session are refused', async () => {
    const first = await sessionWithDrafts(1)
    const second = await sessionWithDrafts(1)
    await expect(
      sendConvocations(db, ctx, { sessionId: first.session.id, ids: second.ids, actor: { userId: first.admin.id } }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('staff never see the drafts', async () => {
    const { people } = await sessionWithDrafts(1)
    expect(await myConvocations(db, people[0]!.user.id, { approved: true })).toEqual([])
  })

  it('accepting without a contract confirms the convocation', async () => {
    const { id, person, session } = await sentConvocation()
    const result = await answerConvocation(db, ctx, { id, userId: person.user.id, answer: 'accept' })
    expect(result).toEqual({ emails: [], signatureRequestId: null })
    expect((await convocation(id))!.status).toBe('accepted')
    const data = await sessionStaffData(db, session.id)
    expect(data.convocations[0]).toMatchObject({ contract: 'none', confirmed: true })
    expect(data.counts).toMatchObject({ confirmed: 1, accepted: 1 })
    expect(await db.select().from(t.signatureRequests)).toHaveLength(0)
  })

  it('accepting with a contract creates the signature request and its email', async () => {
    const contract = await makeDocument(db, { title: 'Contratto della sessione' })
    const { id, person, session } = await sentConvocation({ contractDocumentId: contract.id })
    const result = await answerConvocation(db, ctx, { id, userId: person.user.id, answer: 'accept' })

    const [request] = await db.select().from(t.signatureRequests)
    expect(request).toMatchObject({
      documentId: contract.id,
      userId: person.user.id,
      sessionId: session.id,
      status: 'pending',
    })
    expect(result.signatureRequestId).toBe(request!.id)
    expect(result.emails).toHaveLength(1)
    expect(result.emails[0]).toMatchObject({
      template: 'signature.request',
      to: person.user.email,
      sessionId: session.id,
    })
    expect(result.emails[0]!.html).toContain(`/firma/${request!.id}`)

    let data = await sessionStaffData(db, session.id)
    expect(data.convocations[0]).toMatchObject({ status: 'accepted', contract: 'pending', confirmed: false })
    const [mine] = await myConvocations(db, person.user.id, { approved: true })
    expect(mine).toMatchObject({ contract: 'pending', contractRequestId: request!.id, confirmed: false })

    await db.update(t.signatureRequests).set({ status: 'signed' }).where(eq(t.signatureRequests.id, request!.id))
    data = await sessionStaffData(db, session.id)
    expect(data.convocations[0]).toMatchObject({ contract: 'signed', confirmed: true })
    expect(data.counts.confirmed).toBe(1)
  })

  it('declining keeps the reason; a convocation is answered once, only by its person', async () => {
    const { id, person } = await sentConvocation()
    const stranger = await makeStaff(db, 'approved')
    await expect(answerConvocation(db, ctx, { id, userId: stranger.user.id, answer: 'accept' })).rejects.toMatchObject({
      statusCode: 404,
    })

    await answerConvocation(db, ctx, { id, userId: person.user.id, answer: 'decline', reason: ' Ho un esame ' })
    expect(await convocation(id)).toMatchObject({ status: 'declined', declineReason: 'Ho un esame' })
    await expect(answerConvocation(db, ctx, { id, userId: person.user.id, answer: 'accept' })).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('an inactive person still sees a sent convocation but cannot answer it', async () => {
    const { id, person } = await sentConvocation()
    await db.update(t.staffProfiles).set({ status: 'inactive' }).where(eq(t.staffProfiles.userId, person.user.id))
    const [mine] = await myConvocations(db, person.user.id, { approved: false })
    expect(mine).toMatchObject({ id, status: 'sent', answerable: false })
    const home = await staffHome(db, await profileStatus(person.user.id), TODAY)
    expect(home.toAnswer).toHaveLength(0)
    await expect(answerConvocation(db, ctx, { id, userId: person.user.id, answer: 'accept' })).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('a draft cannot be answered and a closed session refuses answers', async () => {
    const { people, ids } = await sessionWithDrafts(1)
    await expect(
      answerConvocation(db, ctx, { id: ids[0]!, userId: people[0]!.user.id, answer: 'accept' }),
    ).rejects.toMatchObject({ statusCode: 404 })

    const { id, person, session } = await sentConvocation()
    await db.update(t.campSessions).set({ status: 'cancelled' }).where(eq(t.campSessions.id, session.id))
    await expect(answerConvocation(db, ctx, { id, userId: person.user.id, answer: 'accept' })).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('cancelling: a draft is removed silently, a sent one emails, an accepted one also withdraws the contract', async () => {
    const { admin, ids } = await sessionWithDrafts(1)
    expect(await cancelConvocation(db, ctx, { id: ids[0]!, actor: { userId: admin.id } })).toEqual({
      emails: [],
      removed: true,
    })
    expect(await convocation(ids[0]!)).toBeUndefined()

    const contract = await makeDocument(db)
    const sent = await sentConvocation({ contractDocumentId: contract.id })
    await answerConvocation(db, ctx, { id: sent.id, userId: sent.person.user.id, answer: 'accept' })
    const result = await cancelConvocation(db, ctx, { id: sent.id, actor: { userId: sent.admin.id } })
    expect(result.removed).toBe(false)
    expect(result.emails).toHaveLength(1)
    expect(result.emails[0]).toMatchObject({ template: 'staff.convocation_cancelled', to: sent.person.user.email })
    expect((await convocation(sent.id))!.status).toBe('cancelled')
    const [request] = await db
      .select()
      .from(t.signatureRequests)
      .where(and(eq(t.signatureRequests.userId, sent.person.user.id), eq(t.signatureRequests.documentId, contract.id)))
    expect(request!.status).toBe('cancelled')

    await expect(cancelConvocation(db, ctx, { id: sent.id, actor: { userId: sent.admin.id } })).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('a declined person can be convoked again; accepting again reopens the contract request', async () => {
    const contract = await makeDocument(db)
    const { id, person, session, admin } = await sentConvocation({ contractDocumentId: contract.id })
    const actor = { userId: admin.id }
    await answerConvocation(db, ctx, { id, userId: person.user.id, answer: 'accept' })
    await cancelConvocation(db, ctx, { id, actor })

    const again = await addConvocations(db, {
      sessionId: session.id,
      people: [{ userId: person.user.id, role: 'animator' }],
      actor,
    })
    expect(again.added).toBe(1)
    expect(await convocation(id)).toMatchObject({ status: 'draft', role: 'animator', sentAt: null, message: null })
    await sendConvocations(db, ctx, { sessionId: session.id, ids: [id], actor })
    const result = await answerConvocation(db, ctx, { id, userId: person.user.id, answer: 'accept' })
    expect(result.emails).toHaveLength(1)
    const requests = await db.select().from(t.signatureRequests)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.status).toBe('pending')
  })

  it('a contract shared by sessions stays to sign while an accepted convocation in an open session needs it', async () => {
    const contract = await makeDocument(db)
    const shared = { contractDocumentId: contract.id }
    const { actor, sessions, ids } = await acceptedInSessions(shared, shared, shared)
    const requests = () => db.select().from(t.signatureRequests)
    expect(await requests()).toHaveLength(1)
    await db.update(t.campSessions).set({ status: 'completed' }).where(eq(t.campSessions.id, sessions[2]!.id))

    // Cancelling the first session (the cascade of a session move): the second one still needs it.
    await cancelSessionConvocations(db, ctx, { sessionId: sessions[0]!.id, actor })
    expect((await requests()).map(row => row.status)).toEqual(['pending'])
    expect((await convocation(ids[0]!))!.status).toBe('cancelled')

    // The last open one goes: a session already over does not keep the contract to sign.
    await cancelConvocation(db, ctx, { id: ids[1]!, actor })
    expect((await requests()).map(row => row.status)).toEqual(['cancelled'])
  })

  it('accepting never requests an archived contract; a document to read is emailed as such', async () => {
    const archived = await makeDocument(db, { archivedAt: new Date() })
    const first = await sentConvocation({ contractDocumentId: archived.id })
    expect(await answerConvocation(db, ctx, { id: first.id, userId: first.person.user.id, answer: 'accept' })).toEqual({
      emails: [],
      signatureRequestId: null,
    })
    expect(await db.select().from(t.signatureRequests)).toHaveLength(0)

    const toRead = await makeDocument(db, { title: 'Regolamento', requiresSignature: false })
    const second = await sentConvocation({ contractDocumentId: toRead.id })
    const result = await answerConvocation(db, ctx, { id: second.id, userId: second.person.user.id, answer: 'accept' })
    expect(result.emails.map(email => email.subject)).toEqual(['Documento da leggere, «Regolamento»'])
  })

  it('the cancellation dialog knows whether its email reaches the person', async () => {
    const { session, people, ids, admin } = await sessionWithDrafts(2)
    const actor = { userId: admin.id }
    await sendConvocations(db, ctx, { sessionId: session.id, ids, actor })
    const [inactive, disabled] = people
    await db.update(t.staffProfiles).set({ status: 'inactive' }).where(eq(t.staffProfiles.userId, inactive!.user.id))
    await db.update(t.users).set({ status: 'disabled' }).where(eq(t.users.id, disabled!.user.id))
    const outcome = []
    for (const c of (await sessionStaffData(db, session.id)).convocations) {
      const { emails } = await cancelConvocation(db, ctx, { id: c.id, actor })
      outcome.push({ userId: c.userId, sendable: c.sendable, emails: emails.length })
    }
    expect(outcome).toEqual(
      expect.arrayContaining([
        { userId: inactive!.user.id, sendable: true, emails: 1 },
        { userId: disabled!.user.id, sendable: false, emails: 0 },
      ]),
    )
  })

  it('the role changes while the convocation is open', async () => {
    const { admin, ids } = await sessionWithDrafts(1)
    await setConvocationRole(db, { id: ids[0]!, role: 'oss', actor: { userId: admin.id } })
    expect((await convocation(ids[0]!))!.role).toBe('oss')
    await db.update(t.sessionStaff).set({ status: 'declined' }).where(eq(t.sessionStaff.id, ids[0]!))
    await expect(
      setConvocationRole(db, { id: ids[0]!, role: 'nurse', actor: { userId: admin.id } }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('the Staff tab shows the coverage of the session dates, best first', async () => {
    const session = await makeSession(db, { startDate: '2027-06-21', endDate: '2027-06-27' })
    const full = await makeStaff(db, 'approved')
    const partial = await makeStaff(db, 'approved')
    const none = await makeStaff(db, 'approved')
    const applied = await makeStaff(db, 'applied')
    await db.insert(t.staffAvailability).values([
      { userId: full.user.id, startDate: '2027-06-15', endDate: '2027-06-23' },
      { userId: full.user.id, startDate: '2027-06-24', endDate: '2027-07-31' },
      { userId: partial.user.id, startDate: '2027-06-25', endDate: '2027-07-10' },
      { userId: none.user.id, startDate: '2027-08-01', endDate: '2027-08-31' },
    ])
    const data = await sessionStaffData(db, session.id)
    expect(data.available.map(person => [person.userId, person.coverage])).toEqual([
      [full.user.id, 'full'],
      [partial.user.id, 'partial'],
      [none.user.id, 'none'],
    ])
    expect(data.available.find(person => person.userId === applied.user.id)).toBeUndefined()
    expect(data.available[0]!.periods).toHaveLength(2)
    expect(data.available[2]!.periods).toHaveLength(0)
  })
})
