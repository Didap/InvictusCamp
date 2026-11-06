// Sessions, places and reserves: every rule of docs/spec.md 3.2 and 3.3, against a real database.
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  addFamilies,
  answerInvitation,
  callReserve,
  cancelParticipation,
  createSession,
  deleteSession,
  duplicateSession,
  familyHistory,
  familySessions,
  getSessionDetail,
  listSessions,
  participantsCsv,
  reorderReserves,
  resendInvitation,
  sessionCandidates,
  sessionFamiliesOf,
  transitionSession,
  updateSession,
} from '../../server/domain/sessions'
import type { EmailContext, EmailMessage } from '../../server/emails/types'
import type { SessionInput } from '../../shared/schemas/sessions'
import type { ParticipationKind, ParticipationStatus, SessionStatus } from '../../shared/utils/constants'
import { makeAdmin, makeDocument, makeFamily, makeSession, makeStaff, makeUser, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx: EmailContext = { appUrl: 'http://localhost:3080' }
const INVITED_AT = new Date('2026-11-01T09:00:00Z')

async function setup(values: { status?: SessionStatus; familySlots?: number; responseDeadline?: string | null } = {}) {
  const admin = await makeAdmin(db)
  const session = await makeSession(db, {
    status: values.status ?? 'draft',
    familySlots: values.familySlots ?? 3,
    responseDeadline: values.responseDeadline === undefined ? '2027-05-15' : values.responseDeadline,
  })
  return { session, actor: { userId: admin.id, ip: '127.0.0.1' } }
}

/** A family already in the session, in the given state (invited ones were invited on INVITED_AT). */
async function join(
  sessionId: string,
  kind: ParticipationKind,
  status: ParticipationStatus,
  options: { rank?: number; name?: string; disabled?: boolean } = {},
) {
  const { user, family } = await makeFamily(db, { name: options.name ?? `Famiglia ${kind} ${status}` })
  if (options.disabled) await db.update(t.users).set({ status: 'disabled' }).where(eq(t.users.id, user.id))
  const [participation] = await db
    .insert(t.sessionFamilies)
    .values({
      sessionId,
      familyId: family.id,
      kind,
      status,
      reserveRank: kind === 'reserve' ? (options.rank ?? 1) : null,
      invitedAt: status === 'selected' ? null : INVITED_AT,
    })
    .returning()
  return { user, family, participation: participation! }
}

async function participationRow(id: string) {
  const [row] = await db.select().from(t.sessionFamilies).where(eq(t.sessionFamilies.id, id))
  return row!
}

async function sessionRow(id: string) {
  const [row] = await db.select().from(t.campSessions).where(eq(t.campSessions.id, id))
  return row!
}

function sent(emails: EmailMessage[]) {
  return emails.map(email => `${email.template} ${email.to}`).sort()
}

const sessionValues = (values: Partial<SessionInput> = {}): SessionInput => ({
  title: 'Sessione di prova',
  description: null,
  location: 'Invictus Camp, Maruggio (TA)',
  startDate: '2027-06-21',
  endDate: '2027-06-27',
  familySlots: 3,
  staffNeeded: 2,
  responseDeadline: '2027-05-15',
  contractDocumentId: null,
  notes: null,
  ...values,
})

describe('life of a session (spec 3.2)', () => {
  it('allows only the documented moves', async () => {
    const { session, actor } = await setup()
    for (const to of ['confirmed', 'completed', 'draft'] as const) {
      await expect(transitionSession(db, ctx, { sessionId: session.id, to, actor })).rejects.toMatchObject({
        statusCode: 409,
      })
    }
    for (const status of ['completed', 'cancelled'] as const) {
      const closed = await makeSession(db, { status })
      for (const to of ['draft', 'inviting', 'confirmed', 'completed', 'cancelled'] as const) {
        await expect(transitionSession(db, ctx, { sessionId: closed.id, to, actor })).rejects.toMatchObject({
          statusCode: 409,
        })
      }
    }
    expect((await sessionRow(session.id)).status).toBe('draft')
  })

  it('draft → inviting invites the titolari (with the deadline) and tells the reserves', async () => {
    const { session, actor } = await setup()
    const anna = await join(session.id, 'slot', 'selected')
    const luca = await join(session.id, 'slot', 'selected')
    const reserve = await join(session.id, 'reserve', 'selected')
    const removed = await join(session.id, 'slot', 'cancelled')
    const now = new Date('2026-11-05T10:00:00Z')

    const result = await transitionSession(db, ctx, { sessionId: session.id, to: 'inviting', actor, now })

    expect(sent(result.emails)).toEqual(
      sent([
        { template: 'session.invite', to: anna.user.email },
        { template: 'session.invite', to: luca.user.email },
        { template: 'session.reserve', to: reserve.user.email },
      ] as EmailMessage[]),
    )
    const invite = result.emails.find(email => email.template === 'session.invite')!
    expect(invite.subject).toBe('Invito: Sessione di prova')
    expect(invite.text).toContain('Rispondi entro: 15 maggio 2027')
    expect(invite.text).toContain('/famiglia/sessioni')
    expect(result.emails.every(email => email.sessionId === session.id)).toBe(true)
    for (const { participation } of [anna, luca, reserve]) {
      const row = await participationRow(participation.id)
      expect(row.status).toBe('invited')
      expect(row.invitedAt?.toISOString()).toBe(now.toISOString())
    }
    expect((await participationRow(removed.participation.id)).status).toBe('cancelled')
    const updated = await sessionRow(session.id)
    expect(updated.status).toBe('inviting')
    expect(updated.statusChangedAt?.toISOString()).toBe(now.toISOString())
    const [entry] = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'session.status'))
    expect(entry).toMatchObject({ entityId: session.id, data: { from: 'draft', to: 'inviting', emails: 3 } })
  })

  it('never sends to disabled accounts, and the preview counts the same emails', async () => {
    const { session, actor } = await setup()
    await join(session.id, 'slot', 'selected')
    await join(session.id, 'reserve', 'selected')
    const disabled = await join(session.id, 'slot', 'selected', { disabled: true })

    const detail = await getSessionDetail(db, session.id)
    expect(detail.moves.map(move => [move.to, move.emails])).toEqual([
      ['inviting', 2],
      ['cancelled', 0],
    ])
    expect(detail.moves[0]!.emailsByTemplate).toEqual({ 'session.invite': 1, 'session.reserve': 1 })

    const result = await transitionSession(db, ctx, { sessionId: session.id, to: 'inviting', actor })
    expect(result.emails).toHaveLength(2)
    expect(result.emails.map(email => email.to)).not.toContain(disabled.user.email)
    expect((await participationRow(disabled.participation.id)).status).toBe('invited')
  })

  it('inviting → confirmed confirms only to the titolari who confirmed and changes no family', async () => {
    const { session, actor } = await setup({ status: 'inviting' })
    const confirmed = await join(session.id, 'slot', 'confirmed')
    const waiting = await join(session.id, 'slot', 'invited')
    await join(session.id, 'slot', 'declined')
    await join(session.id, 'reserve', 'invited')

    const result = await transitionSession(db, ctx, { sessionId: session.id, to: 'confirmed', actor })

    expect(sent(result.emails)).toEqual([`session.confirmed ${confirmed.user.email}`])
    expect(result.emails[0]!.subject).toBe('Sessione confermata: Sessione di prova')
    expect((await participationRow(waiting.participation.id)).status).toBe('invited')
  })

  it('confirmed → completed sends nothing', async () => {
    const { session, actor } = await setup({ status: 'confirmed' })
    await join(session.id, 'slot', 'confirmed')
    const result = await transitionSession(db, ctx, { sessionId: session.id, to: 'completed', actor })
    expect(result.emails).toEqual([])
    expect((await sessionRow(session.id)).status).toBe('completed')
  })

  it('cancelling cancels every family still in and tells only those who had been invited', async () => {
    const { session, actor } = await setup({ status: 'inviting' })
    const confirmed = await join(session.id, 'slot', 'confirmed')
    const invited = await join(session.id, 'slot', 'invited')
    const reserve = await join(session.id, 'reserve', 'invited')
    const declined = await join(session.id, 'slot', 'declined')

    const result = await transitionSession(db, ctx, { sessionId: session.id, to: 'cancelled', actor })

    expect(sent(result.emails)).toEqual(
      [confirmed, invited, reserve].map(f => `session.cancelled ${f.user.email}`).sort(),
    )
    for (const { participation } of [confirmed, invited, reserve]) {
      expect((await participationRow(participation.id)).status).toBe('cancelled')
    }
    expect((await participationRow(declined.participation.id)).status).toBe('declined')
  })

  it('cancelling a draft cancels the selected families without any email', async () => {
    const { session, actor } = await setup()
    const selected = await join(session.id, 'slot', 'selected')
    const result = await transitionSession(db, ctx, { sessionId: session.id, to: 'cancelled', actor })
    expect(result.emails).toEqual([])
    expect((await participationRow(selected.participation.id)).status).toBe('cancelled')
  })
})

describe('families in a session (spec 3.3)', () => {
  it('in draft, added families are selected and nothing is sent', async () => {
    const { session, actor } = await setup()
    const a = await makeFamily(db)
    const b = await makeFamily(db)
    const result = await addFamilies(db, ctx, {
      sessionId: session.id,
      familyIds: [a.family.id, b.family.id],
      kind: 'slot',
      actor,
    })
    expect(result).toMatchObject({ added: 2, invited: 0, emails: [] })
    const rows = await db.select().from(t.sessionFamilies).where(eq(t.sessionFamilies.sessionId, session.id))
    expect(rows.map(row => [row.status, row.invitedAt])).toEqual([
      ['selected', null],
      ['selected', null],
    ])
  })

  it('while the session is open, a titolare is invited at once and a reserve is told', async () => {
    for (const status of ['inviting', 'confirmed'] as const) {
      const { session, actor } = await setup({ status })
      const titolare = await makeFamily(db)
      const reserve = await makeFamily(db)
      const added = await addFamilies(db, ctx, {
        sessionId: session.id,
        familyIds: [titolare.family.id],
        kind: 'slot',
        actor,
      })
      expect(added.invited).toBe(1)
      expect(sent(added.emails)).toEqual([`session.invite ${titolare.user.email}`])
      const waiting = await addFamilies(db, ctx, {
        sessionId: session.id,
        familyIds: [reserve.family.id],
        kind: 'reserve',
        actor,
      })
      expect(sent(waiting.emails)).toEqual([`session.reserve ${reserve.user.email}`])
      const rows = await db.select().from(t.sessionFamilies).where(eq(t.sessionFamilies.sessionId, session.id))
      expect(rows.every(row => row.status === 'invited' && row.invitedAt)).toBe(true)
    }
  })

  it('refuses titolari beyond the places; reserves are unlimited and queue at the end', async () => {
    const { session, actor } = await setup({ familySlots: 2 })
    const families = await Promise.all([1, 2, 3, 4, 5].map(() => makeFamily(db)))
    const ids = families.map(f => f.family.id)

    await expect(
      addFamilies(db, ctx, { sessionId: session.id, familyIds: ids.slice(0, 3), kind: 'slot', actor }),
    ).rejects.toMatchObject({ statusCode: 409 })
    await addFamilies(db, ctx, { sessionId: session.id, familyIds: [ids[0]!], kind: 'slot', actor })
    await expect(
      addFamilies(db, ctx, { sessionId: session.id, familyIds: ids.slice(1, 3), kind: 'slot', actor }),
    ).rejects.toThrow('Restano 1 posto libero')
    await addFamilies(db, ctx, { sessionId: session.id, familyIds: [ids[1]!], kind: 'slot', actor })
    await expect(
      addFamilies(db, ctx, { sessionId: session.id, familyIds: [ids[2]!], kind: 'slot', actor }),
    ).rejects.toThrow('Non ci sono posti liberi')

    await addFamilies(db, ctx, { sessionId: session.id, familyIds: ids.slice(2), kind: 'reserve', actor })
    const dto = await sessionFamiliesOf(db, session.id)
    expect(dto.slots).toEqual({ total: 2, held: 2, confirmed: 0, free: 0, reserves: 3 })
    expect(dto.participations.filter(p => p.kind === 'reserve').map(p => [p.familyId, p.reserveRank])).toEqual([
      [ids[2], 1],
      [ids[3], 2],
      [ids[4], 3],
    ])
  })

  it('refuses a family already in the session and adds again one that declined, on the same row', async () => {
    const { session, actor } = await setup({ status: 'inviting' })
    const declined = await join(session.id, 'slot', 'declined')
    const active = await join(session.id, 'slot', 'invited', { name: 'Famiglia Bianchi' })

    await expect(
      addFamilies(db, ctx, { sessionId: session.id, familyIds: [active.family.id], kind: 'reserve', actor }),
    ).rejects.toThrow('Famiglia Bianchi è già nella sessione')

    const result = await addFamilies(db, ctx, {
      sessionId: session.id,
      familyIds: [declined.family.id],
      kind: 'reserve',
      actor,
    })
    expect(result.added).toBe(1)
    const row = await participationRow(declined.participation.id)
    expect(row).toMatchObject({ kind: 'reserve', status: 'invited', reserveRank: 1, respondedAt: null })
  })

  it('refuses families when the session is over', async () => {
    for (const status of ['completed', 'cancelled'] as const) {
      const { session, actor } = await setup({ status })
      const { family } = await makeFamily(db)
      await expect(
        addFamilies(db, ctx, { sessionId: session.id, familyIds: [family.id], kind: 'reserve', actor }),
      ).rejects.toMatchObject({ statusCode: 409 })
    }
  })

  it('a family confirms or declines its invitation, with an optional reason that stays out of the audit', async () => {
    const { session } = await setup({ status: 'inviting' })
    const anna = await join(session.id, 'slot', 'invited')
    const luca = await join(session.id, 'slot', 'invited')
    const now = new Date('2026-11-10T10:00:00Z')

    await answerInvitation(db, {
      participationId: anna.participation.id,
      answer: 'confirmed',
      by: 'family',
      familyId: anna.family.id,
      actor: { userId: anna.user.id },
      now,
    })
    await answerInvitation(db, {
      participationId: luca.participation.id,
      answer: 'declined',
      reason: 'Siamo via in quei giorni',
      by: 'family',
      familyId: luca.family.id,
      actor: { userId: luca.user.id },
      now,
    })

    expect(await participationRow(anna.participation.id)).toMatchObject({
      status: 'confirmed',
      respondedAt: now,
      declineReason: null,
    })
    expect(await participationRow(luca.participation.id)).toMatchObject({
      status: 'declined',
      declineReason: 'Siamo via in quei giorni',
    })
    const entries = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'participation.answer'))
    expect(entries).toHaveLength(2)
    expect(JSON.stringify(entries)).not.toContain('Siamo via')
  })

  it('a declined titolare frees its place, and no reserve is promoted by itself', async () => {
    const { session, actor } = await setup({ status: 'inviting', familySlots: 1 })
    const anna = await join(session.id, 'slot', 'invited')
    const reserve = await join(session.id, 'reserve', 'invited')
    const other = await makeFamily(db)
    await expect(
      addFamilies(db, ctx, { sessionId: session.id, familyIds: [other.family.id], kind: 'slot', actor }),
    ).rejects.toMatchObject({ statusCode: 409 })
    await answerInvitation(db, {
      participationId: anna.participation.id,
      answer: 'declined',
      by: 'family',
      familyId: anna.family.id,
      actor: { userId: anna.user.id },
    })
    expect((await getSessionDetail(db, session.id)).slots.free).toBe(1)
    expect(await participationRow(reserve.participation.id)).toMatchObject({ kind: 'reserve', status: 'invited' })
    await addFamilies(db, ctx, { sessionId: session.id, familyIds: [other.family.id], kind: 'slot', actor })
  })

  it('a family answers only its own invitations, and never one it cannot see', async () => {
    const { session } = await setup({ status: 'inviting' })
    const anna = await join(session.id, 'slot', 'invited')
    const luca = await join(session.id, 'slot', 'invited')
    await expect(
      answerInvitation(db, {
        participationId: anna.participation.id,
        answer: 'declined',
        by: 'family',
        familyId: luca.family.id,
        actor: { userId: luca.user.id },
      }),
    ).rejects.toMatchObject({ statusCode: 404 })

    const draft = await makeSession(db)
    const selected = await join(draft.id, 'slot', 'selected')
    await expect(
      answerInvitation(db, {
        participationId: selected.participation.id,
        answer: 'confirmed',
        by: 'family',
        familyId: selected.family.id,
        actor: { userId: selected.user.id },
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect((await participationRow(anna.participation.id)).status).toBe('invited')
  })

  it('answers only while the session is inviting or confirmed, and still after the deadline', async () => {
    const { session } = await setup({ status: 'confirmed', responseDeadline: '2027-01-15' })
    const late = await join(session.id, 'slot', 'invited')
    const result = await answerInvitation(db, {
      participationId: late.participation.id,
      answer: 'confirmed',
      by: 'family',
      familyId: late.family.id,
      actor: { userId: late.user.id },
      now: new Date('2027-02-01T10:00:00Z'),
    })
    expect(result.late).toBe(true)
    const [item] = (await sessionFamiliesOf(db, session.id)).participations
    expect(item!.lateAnswer).toBe(true)

    for (const status of ['completed', 'cancelled'] as const) {
      const closed = await makeSession(db, { status })
      const family = await join(closed.id, 'slot', 'invited')
      await expect(
        answerInvitation(db, {
          participationId: family.participation.id,
          answer: 'confirmed',
          by: 'family',
          familyId: family.family.id,
          actor: { userId: family.user.id },
        }),
      ).rejects.toMatchObject({ statusCode: 409 })
    }
  })

  it('a family answers once; the administration records an answer by phone, a later withdrawal too', async () => {
    const { session, actor } = await setup({ status: 'inviting' })
    const anna = await join(session.id, 'slot', 'invited')
    const luca = await join(session.id, 'slot', 'invited')
    const byFamily = {
      participationId: anna.participation.id,
      by: 'family' as const,
      familyId: anna.family.id,
      actor: { userId: anna.user.id },
    }
    await answerInvitation(db, { ...byFamily, answer: 'confirmed' })
    await expect(answerInvitation(db, { ...byFamily, answer: 'declined' })).rejects.toThrow(
      'Hai già risposto a questo invito',
    )

    await answerInvitation(db, {
      participationId: luca.participation.id,
      sessionId: session.id,
      answer: 'confirmed',
      by: 'admin',
      actor,
    })
    expect((await participationRow(luca.participation.id)).status).toBe('confirmed')
    await answerInvitation(db, {
      participationId: anna.participation.id,
      sessionId: session.id,
      answer: 'declined',
      reason: 'Ha chiamato per rinunciare',
      by: 'admin',
      actor,
    })
    expect((await participationRow(anna.participation.id)).status).toBe('declined')
    const entries = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'participation.answer_by_admin'))
    expect(entries).toHaveLength(2)
    expect(entries.every(entry => entry.actorUserId === actor.userId)).toBe(true)

    const other = await makeSession(db, { status: 'inviting' })
    await expect(
      answerInvitation(db, {
        participationId: luca.participation.id,
        sessionId: other.id,
        answer: 'declined',
        by: 'admin',
        actor,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a reserve cannot confirm before being called, but can leave the list', async () => {
    const { session } = await setup({ status: 'inviting' })
    const first = await join(session.id, 'reserve', 'invited', { rank: 1 })
    const second = await join(session.id, 'reserve', 'invited', { rank: 2 })
    const answer = (value: 'confirmed' | 'declined') =>
      answerInvitation(db, {
        participationId: first.participation.id,
        answer: value,
        by: 'family',
        familyId: first.family.id,
        actor: { userId: first.user.id },
      })
    await expect(answer('confirmed')).rejects.toMatchObject({ statusCode: 409 })
    await answer('declined')
    expect((await participationRow(first.participation.id)).status).toBe('declined')
    expect((await participationRow(second.participation.id)).reserveRank).toBe(1)
  })

  it('calling a reserve promotes the first waiting one and, while open, offers it the place', async () => {
    const { session, actor } = await setup({ status: 'inviting', familySlots: 2 })
    await join(session.id, 'slot', 'confirmed')
    await join(session.id, 'slot', 'declined')
    const second = await join(session.id, 'reserve', 'invited', { rank: 2 })
    const first = await join(session.id, 'reserve', 'invited', { rank: 1 })
    const now = new Date('2026-11-20T10:00:00Z')

    const result = await callReserve(db, ctx, { sessionId: session.id, actor, now })

    expect(result.participationId).toBe(first.participation.id)
    expect(sent(result.emails)).toEqual([`session.slot_offered ${first.user.email}`])
    expect(result.emails[0]!.subject).toBe('Si è liberato un posto: Sessione di prova')
    expect(await participationRow(first.participation.id)).toMatchObject({
      kind: 'slot',
      status: 'invited',
      reserveRank: null,
      invitedAt: now,
    })
    expect((await participationRow(second.participation.id)).reserveRank).toBe(1)
    const [entry] = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'participation.call_reserve'))
    expect(entry!.entityId).toBe(first.participation.id)
  })

  it('calls the chosen reserve; in draft it becomes selected and nothing is sent', async () => {
    const { session, actor } = await setup({ familySlots: 1 })
    const first = await join(session.id, 'reserve', 'selected', { rank: 1 })
    const chosen = await join(session.id, 'reserve', 'selected', { rank: 2 })
    const result = await callReserve(db, ctx, {
      sessionId: session.id,
      participationId: chosen.participation.id,
      actor,
    })
    expect(result.emails).toEqual([])
    expect(await participationRow(chosen.participation.id)).toMatchObject({
      kind: 'slot',
      status: 'selected',
      reserveRank: null,
      invitedAt: null,
    })
    expect((await participationRow(first.participation.id)).reserveRank).toBe(1)
  })

  it('calls a reserve only with a free place and a waiting reserve', async () => {
    const { session, actor } = await setup({ status: 'inviting', familySlots: 1 })
    const titolare = await join(session.id, 'slot', 'invited')
    const reserve = await join(session.id, 'reserve', 'invited')
    await expect(callReserve(db, ctx, { sessionId: session.id, actor })).rejects.toThrow('Non ci sono posti liberi')

    await db
      .update(t.sessionFamilies)
      .set({ status: 'declined' })
      .where(eq(t.sessionFamilies.id, titolare.participation.id))
    await expect(
      callReserve(db, ctx, { sessionId: session.id, participationId: titolare.participation.id, actor }),
    ).rejects.toMatchObject({ statusCode: 409 })
    await callReserve(db, ctx, { sessionId: session.id, participationId: reserve.participation.id, actor })

    const empty = await setup({ status: 'inviting', familySlots: 1 })
    await expect(callReserve(db, ctx, { sessionId: empty.session.id, actor })).rejects.toThrow(
      'Non ci sono riserve in attesa',
    )
  })

  it('removing a family cancels it, with session.removed only if it had been invited', async () => {
    const { session, actor } = await setup({ status: 'inviting' })
    const invited = await join(session.id, 'slot', 'confirmed')
    const reserve = await join(session.id, 'reserve', 'invited', { rank: 1 })
    const nextReserve = await join(session.id, 'reserve', 'invited', { rank: 2 })
    const declined = await join(session.id, 'slot', 'declined')

    const removed = await cancelParticipation(db, ctx, {
      sessionId: session.id,
      participationId: invited.participation.id,
      actor,
    })
    expect(sent(removed.emails)).toEqual([`session.removed ${invited.user.email}`])
    expect((await participationRow(invited.participation.id)).status).toBe('cancelled')
    expect((await getSessionDetail(db, session.id)).slots.held).toBe(0)

    const fromList = await cancelParticipation(db, ctx, {
      sessionId: session.id,
      participationId: reserve.participation.id,
      actor,
    })
    expect(fromList.emails[0]!.text).toContain('non è più nella lista di riserva')
    expect((await participationRow(nextReserve.participation.id)).reserveRank).toBe(1)

    await expect(
      cancelParticipation(db, ctx, { sessionId: session.id, participationId: declined.participation.id, actor }),
    ).rejects.toMatchObject({ statusCode: 409 })

    const draft = await setup()
    const selected = await join(draft.session.id, 'slot', 'selected')
    const silent = await cancelParticipation(db, ctx, {
      sessionId: draft.session.id,
      participationId: selected.participation.id,
      actor,
    })
    expect(silent.emails).toEqual([])
  })

  it('reorders the waiting reserves with the complete list only', async () => {
    const { session, actor } = await setup({ status: 'inviting' })
    const a = await join(session.id, 'reserve', 'invited', { rank: 1 })
    const b = await join(session.id, 'reserve', 'invited', { rank: 2 })
    const c = await join(session.id, 'reserve', 'invited', { rank: 3 })
    const ids = [a, b, c].map(f => f.participation.id)

    await reorderReserves(db, { sessionId: session.id, order: [ids[2]!, ids[0]!, ids[1]!], actor })
    const ranks = await Promise.all(ids.map(async id => (await participationRow(id)).reserveRank))
    expect(ranks).toEqual([2, 3, 1])

    for (const order of [
      [ids[0]!, ids[1]!],
      [ids[0]!, ids[0]!, ids[1]!],
    ]) {
      await expect(reorderReserves(db, { sessionId: session.id, order, actor })).rejects.toMatchObject({
        statusCode: 409,
      })
    }
  })

  it('resends only an invitation still waiting for an answer', async () => {
    const { session, actor } = await setup({ status: 'inviting' })
    const waiting = await join(session.id, 'slot', 'invited')
    const reserve = await join(session.id, 'reserve', 'invited')
    const answered = await join(session.id, 'slot', 'confirmed')
    const disabled = await join(session.id, 'slot', 'invited', { disabled: true })

    const again = await resendInvitation(db, ctx, {
      sessionId: session.id,
      participationId: waiting.participation.id,
      actor,
    })
    expect(sent(again.emails)).toEqual([`session.invite ${waiting.user.email}`])
    expect(again.emails[0]!.subject).toBe('Promemoria invito: Sessione di prova')
    const list = await resendInvitation(db, ctx, {
      sessionId: session.id,
      participationId: reserve.participation.id,
      actor,
    })
    expect(list.emails[0]!.template).toBe('session.reserve')
    for (const participationId of [answered.participation.id, disabled.participation.id]) {
      await expect(resendInvitation(db, ctx, { sessionId: session.id, participationId, actor })).rejects.toMatchObject({
        statusCode: 409,
      })
    }

    const draft = await setup()
    const selected = await join(draft.session.id, 'slot', 'selected')
    await expect(
      resendInvitation(db, ctx, { sessionId: draft.session.id, participationId: selected.participation.id, actor }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('keeps health details out of every email', async () => {
    const { session, actor } = await setup()
    const anna = await join(session.id, 'slot', 'selected')
    await db.insert(t.familyMembers).values({
      familyId: anna.family.id,
      firstName: 'Marco',
      lastName: 'Rossi',
      relationship: 'child',
      hasDisability: true,
      disability: { description: 'DETTAGLIO-RISERVATO' },
    })
    const { emails } = await transitionSession(db, ctx, { sessionId: session.id, to: 'inviting', actor })
    expect(emails).toHaveLength(1)
    expect(`${emails[0]!.html}${emails[0]!.text}`).not.toContain('DETTAGLIO-RISERVATO')
  })
})

describe('what a family sees', () => {
  it('sees a session only once invited, and can answer only an open invitation', async () => {
    const { session, actor } = await setup()
    const titolare = await join(session.id, 'slot', 'selected')
    const reserve = await join(session.id, 'reserve', 'selected')
    expect(await familySessions(db, titolare.family.id)).toEqual([])

    await transitionSession(db, ctx, { sessionId: session.id, to: 'inviting', actor })
    const [mine] = await familySessions(db, titolare.family.id)
    expect(mine).toMatchObject({ sessionId: session.id, status: 'invited', canConfirm: true, canDecline: true })
    const [waiting] = await familySessions(db, reserve.family.id)
    expect(waiting).toMatchObject({ kind: 'reserve', canConfirm: false, canDecline: true })

    const draft = await makeSession(db)
    await db.insert(t.sessionFamilies).values({ sessionId: draft.id, familyId: titolare.family.id, kind: 'slot' })
    await transitionSession(db, ctx, { sessionId: draft.id, to: 'cancelled', actor })
    expect(await familySessions(db, titolare.family.id)).toHaveLength(1)

    const history = await familyHistory(db, titolare.family.id)
    expect(history.map(item => item.sessionId).sort()).toEqual([session.id, draft.id].sort())
  })
})

describe('the session itself', () => {
  it('creates drafts and edits them; places never drop below the titolari holding one', async () => {
    const admin = await makeAdmin(db)
    const actor = { userId: admin.id }
    const { id } = await createSession(db, { values: sessionValues(), actor })
    expect(await sessionRow(id)).toMatchObject({ status: 'draft', createdBy: admin.id, familySlots: 3 })

    for (const status of ['selected', 'invited', 'confirmed'] as const) await join(id, 'slot', status)
    await join(id, 'slot', 'declined')
    await expect(
      updateSession(db, { sessionId: id, values: sessionValues({ familySlots: 2 }), actor }),
    ).rejects.toThrow('Ci sono già 3 famiglie titolari')
    await updateSession(db, { sessionId: id, values: sessionValues({ familySlots: 3, title: 'Nuovo titolo' }), actor })
    expect((await sessionRow(id)).title).toBe('Nuovo titolo')
    const [entry] = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'session.update'))
    expect(entry!.data).toEqual({ fields: ['title'] })

    const consent = await makeDocument(db, { category: 'consent' })
    await expect(
      updateSession(db, { sessionId: id, values: sessionValues({ contractDocumentId: consent.id }), actor }),
    ).rejects.toMatchObject({ statusCode: 400 })
    const contract = await makeDocument(db, { category: 'contract' })
    await updateSession(db, { sessionId: id, values: sessionValues({ contractDocumentId: contract.id }), actor })

    const done = await makeSession(db, { status: 'completed' })
    await expect(updateSession(db, { sessionId: done.id, values: sessionValues(), actor })).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('lists upcoming sessions first, filters by status and counts places, reserves and staff', async () => {
    const contract = await makeDocument(db, { category: 'contract' })
    const past = await makeSession(db, { title: 'Passata', startDate: '2026-07-13', endDate: '2026-07-19' })
    const later = await makeSession(db, { title: 'Più avanti', startDate: '2027-09-06', endDate: '2027-09-12' })
    const soon = await makeSession(db, {
      title: 'Presto',
      status: 'inviting',
      startDate: '2027-06-21',
      endDate: '2027-06-27',
      familySlots: 4,
      staffNeeded: 3,
      contractDocumentId: contract.id,
    })
    await join(soon.id, 'slot', 'confirmed')
    await join(soon.id, 'slot', 'invited')
    await join(soon.id, 'slot', 'declined')
    await join(soon.id, 'reserve', 'invited')
    const signer = await makeStaff(db)
    const unsigned = await makeStaff(db)
    const waiting = await makeStaff(db)
    await db.insert(t.sessionStaff).values([
      { sessionId: soon.id, userId: signer.user.id, status: 'accepted' },
      { sessionId: soon.id, userId: unsigned.user.id, status: 'accepted' },
      { sessionId: soon.id, userId: waiting.user.id, status: 'sent' },
    ])
    await db
      .insert(t.signatureRequests)
      .values({ documentId: contract.id, userId: signer.user.id, status: 'signed', sessionId: soon.id })

    const all = await listSessions(db, {}, '2026-11-06')
    expect(all.map(s => s.title)).toEqual(['Presto', 'Più avanti', 'Passata'])
    expect(all[0]!.slots).toEqual({ total: 4, held: 2, confirmed: 1, free: 2, reserves: 1 })
    expect(all[0]!.staff).toEqual({ needed: 3, confirmed: 1, accepted: 2, waiting: 1, toSend: 0 })

    const open = await listSessions(db, { statuses: ['draft', 'inviting', 'confirmed'] }, '2026-11-06')
    expect(open.map(s => s.id)).toEqual([soon.id, later.id, past.id])
    expect((await listSessions(db, { statuses: ['inviting'] })).map(s => s.id)).toEqual([soon.id])
    expect((await listSessions(db, { q: 'avanti' })).map(s => s.id)).toEqual([later.id])
  })

  it('offers as candidates the families not in the session, those who left it, never disabled accounts', async () => {
    const { session } = await setup({ status: 'inviting' })
    const inside = await join(session.id, 'slot', 'invited')
    const left = await join(session.id, 'slot', 'declined')
    const free = await makeFamily(db, { name: 'Famiglia Libera' })
    const disabledUser = await makeUser(db, { role: 'family', status: 'disabled' })
    await db.insert(t.families).values({ userId: disabledUser.id, name: 'Famiglia Disattivata' })

    const candidates = await sessionCandidates(db, session.id)
    expect(candidates.map(c => c.id).sort()).toEqual([left.family.id, free.family.id].sort())
    expect(candidates.find(c => c.id === left.family.id)!.previousStatus).toBe('declined')
    expect(candidates.map(c => c.id)).not.toContain(inside.family.id)
    expect((await sessionCandidates(db, session.id, 'libera')).map(c => c.id)).toEqual([free.family.id])
  })

  it('deletes only a draft without families and staff; duplicates without families', async () => {
    const { session, actor } = await setup()
    const busy = await makeSession(db)
    await join(busy.id, 'slot', 'selected')
    const open = await makeSession(db, { status: 'inviting' })

    await expect(deleteSession(db, { sessionId: busy.id, actor })).rejects.toMatchObject({ statusCode: 409 })
    await expect(deleteSession(db, { sessionId: open.id, actor })).rejects.toMatchObject({ statusCode: 409 })
    expect((await getSessionDetail(db, session.id)).deletable).toBe(true)
    await deleteSession(db, { sessionId: session.id, actor })
    expect(await db.select().from(t.campSessions).where(eq(t.campSessions.id, session.id))).toEqual([])

    const copy = await duplicateSession(db, { sessionId: busy.id, actor })
    expect(await sessionRow(copy.id)).toMatchObject({ title: 'Sessione di prova (copia)', status: 'draft' })
    expect(
      await db
        .select()
        .from(t.sessionFamilies)
        .where(and(eq(t.sessionFamilies.sessionId, copy.id))),
    ).toEqual([])
  })

  it('exports the families as CSV without health details and with formulas defused', async () => {
    const { session } = await setup({ status: 'inviting' })
    const anna = await join(session.id, 'slot', 'declined', { name: '=Famiglia Rossi' })
    await db
      .update(t.sessionFamilies)
      .set({ declineReason: 'Motivo; con "virgolette"' })
      .where(eq(t.sessionFamilies.id, anna.participation.id))
    await db.insert(t.familyMembers).values({
      familyId: anna.family.id,
      firstName: 'Marco',
      lastName: 'Rossi',
      relationship: 'child',
      disability: { description: 'DETTAGLIO-RISERVATO' },
    })
    const { csv, filename } = await participantsCsv(db, session.id)
    expect(filename).toBe('partecipanti-sessione-di-prova-21-06-2027.csv')
    const [header, row] = csv.replace('﻿', '').trim().split('\r\n')
    expect(header).toContain('Famiglia;Referente;Email')
    expect(row).toContain("'=Famiglia Rossi")
    expect(row).toContain('"Motivo; con ""virgolette"""')
    expect(csv).not.toContain('DETTAGLIO-RISERVATO')
  })
})
