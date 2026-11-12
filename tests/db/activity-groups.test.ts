// Activity groups (docs/spec.md 3.12): the families of a session split among Giallo, Rosso and Blu, each
// group with its leader from the session staff.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  assignGroup,
  distributeGroups,
  groupsCsv,
  sessionGroupsOf,
  setGroupLeader,
} from '../../server/domain/activity-groups'
import { answerInvitation, cancelParticipation, transitionSession } from '../../server/domain/sessions'
import { answerConvocation, cancelConvocation } from '../../server/domain/staff'
import type {
  ConvocationStatus,
  ParticipationKind,
  ParticipationStatus,
  ProgrammeGroup,
  SessionStatus,
  StaffRole,
} from '../../shared/utils/constants'
import { makeAdmin, makeFamily, makeSession, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx = { appUrl: 'http://localhost:3080' }

async function setup(status: SessionStatus = 'confirmed') {
  const admin = await makeAdmin(db)
  const session = await makeSession(db, { status })
  const actor = { userId: admin.id, ip: '127.0.0.1' }
  const assign = (participationId: string, group: ProgrammeGroup | null) =>
    assignGroup(db, { sessionId: session.id, participationId, group, actor })
  const lead = (group: ProgrammeGroup, convocationId: string | null) =>
    setGroupLeader(db, { sessionId: session.id, group, convocationId, actor })
  return { session, actor, assign, lead }
}

type Card = { firstName: string | null; kind?: 'adult' | 'young'; birthDate?: string; position?: number }

/** A family in the session with the given cards. */
async function join(
  sessionId: string,
  name: string,
  options: { kind?: ParticipationKind; status?: ParticipationStatus; cards?: Card[] } = {},
) {
  const { family } = await makeFamily(db, { name })
  if (options.cards?.length) {
    await db.insert(t.familyMembers).values(options.cards.map(card => ({ familyId: family.id, ...card })))
  }
  const kind = options.kind ?? 'slot'
  const status = options.status ?? 'confirmed'
  const [participation] = await db
    .insert(t.sessionFamilies)
    .values({
      sessionId,
      familyId: family.id,
      kind,
      status,
      reserveRank: kind === 'reserve' ? 1 : null,
      invitedAt: status === 'selected' ? null : new Date(),
    })
    .returning()
  return participation!
}

/** A person of the staff convoked to the session. */
async function convoke(
  sessionId: string,
  firstName: string,
  options: { status?: ConvocationStatus; role?: StaffRole } = {},
) {
  const { user } = await makeStaff(db)
  await db.update(t.users).set({ firstName, lastName: 'Staff' }).where(eq(t.users.id, user.id))
  const [row] = await db
    .insert(t.sessionStaff)
    .values({ sessionId, userId: user.id, status: options.status ?? 'accepted', role: options.role ?? 'group_lead' })
    .returning()
  return { ...row!, user }
}

async function groupOf(participationId: string) {
  const [row] = await db
    .select({ group: t.sessionFamilies.activityGroup })
    .from(t.sessionFamilies)
    .where(eq(t.sessionFamilies.id, participationId))
  return row!.group
}

async function leaders(sessionId: string) {
  const rows = await db
    .select({ id: t.sessionStaff.id, group: t.sessionStaff.activityGroup })
    .from(t.sessionStaff)
    .where(eq(t.sessionStaff.sessionId, sessionId))
  return Object.fromEntries(rows.filter(row => row.group).map(row => [row.group, row.id]))
}

describe('the families of a session', () => {
  it('lists the titolari holding a place by name, the young first with their age at the start', async () => {
    const { session } = await setup()
    await join(session.id, 'Famiglia Rossi', {
      cards: [
        { firstName: 'Grazia', position: 0 },
        { firstName: 'Matteo', kind: 'young', birthDate: '2021-06-22', position: 1 },
        { firstName: 'Riccardo', kind: 'young', birthDate: '2018-01-10', position: 2 },
        { firstName: null, position: 3 },
        { firstName: 'Ada', kind: 'young', birthDate: '2027-09-01', position: 4 },
      ],
    })
    await join(session.id, 'Famiglia Bianchi', { status: 'invited' })
    await join(session.id, 'Famiglia Verdi', { status: 'declined' })
    await join(session.id, 'Famiglia Neri', { kind: 'reserve', status: 'invited' })

    const dto = await sessionGroupsOf(db, session.id)
    expect(dto.editable).toBe(true)
    expect(dto.families.map(family => [family.familyName, family.group])).toEqual([
      ['Famiglia Bianchi', null],
      ['Famiglia Rossi', null],
    ])
    // The session starts on 2027-06-21: Matteo turns 6 the day after, Ada is born after it. The empty card
    // is named as in the family pages.
    expect(dto.families[1]!.members).toEqual([
      { name: 'Matteo', age: 5 },
      { name: 'Riccardo', age: 9 },
      { name: 'Ada', age: null },
      { name: 'Grazia', age: null },
      { name: 'Adulto 2', age: null },
    ])
  })

  it('puts a family in a group, moves it and takes it out, audited', async () => {
    const { session, assign } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi')
    await assign(rossi.id, 'yellow')
    await assign(rossi.id, 'blue')
    await assign(rossi.id, 'blue')
    expect(await groupOf(rossi.id)).toBe('blue')
    await assign(rossi.id, null)
    expect(await groupOf(rossi.id)).toBeNull()

    const audits = await db
      .select({ data: t.auditLog.data })
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'participation.activity_group'))
    expect(audits.map(row => row.data)).toEqual([
      { sessionId: session.id, from: null, to: 'yellow' },
      { sessionId: session.id, from: 'yellow', to: 'blue' },
      { sessionId: session.id, from: 'blue', to: null },
    ])
  })

  it('refuses a family without a place, one of another session and a closed session', async () => {
    const { session, assign } = await setup()
    const reserve = await join(session.id, 'Famiglia Neri', { kind: 'reserve', status: 'invited' })
    await expect(assign(reserve.id, 'red')).rejects.toMatchObject({ statusCode: 404 })
    const other = await makeSession(db)
    const elsewhere = await join(other.id, 'Famiglia Gialli')
    await expect(assign(elsewhere.id, 'red')).rejects.toMatchObject({ statusCode: 404 })

    const closed = await setup('completed')
    const rossi = await join(closed.session.id, 'Famiglia Rossi')
    await expect(closed.assign(rossi.id, 'red')).rejects.toMatchObject({ statusCode: 409 })
    expect((await sessionGroupsOf(db, closed.session.id)).editable).toBe(false)
  })

  it('takes a family out of its group when it declines or is removed', async () => {
    const { session, actor, assign } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi', { status: 'invited' })
    const bianchi = await join(session.id, 'Famiglia Bianchi')
    await assign(rossi.id, 'yellow')
    await assign(bianchi.id, 'red')

    await answerInvitation(db, {
      participationId: rossi.id,
      answer: 'declined',
      by: 'admin',
      sessionId: session.id,
      actor,
    })
    await cancelParticipation(db, ctx, { sessionId: session.id, participationId: bianchi.id, actor })
    expect(await groupOf(rossi.id)).toBeNull()
    expect(await groupOf(bianchi.id)).toBeNull()
  })

  it('divides the families without a group, the largest first, keeping the groups even', async () => {
    const { session, actor, assign } = await setup()
    const people = (n: number): Card[] => Array.from({ length: n }, (_, i) => ({ firstName: `P${i}` }))
    const rossi = await join(session.id, 'Famiglia Rossi', { cards: people(4) })
    const bianchi = await join(session.id, 'Famiglia Bianchi', { cards: people(4) })
    const verdi = await join(session.id, 'Famiglia Verdi', { cards: people(3) })
    const neri = await join(session.id, 'Famiglia Neri', { cards: people(2) })
    await assign(rossi.id, 'blue')

    expect(await distributeGroups(db, { sessionId: session.id, actor })).toBe(3)
    expect(await groupOf(rossi.id)).toBe('blue')
    expect(await groupOf(bianchi.id)).toBe('yellow')
    expect(await groupOf(verdi.id)).toBe('red')
    expect(await groupOf(neri.id)).toBe('red')
    expect(await distributeGroups(db, { sessionId: session.id, actor })).toBe(0)
  })
})

describe('the leaders', () => {
  it('lists the session staff that can lead, group leads first, and gives each group one leader', async () => {
    const { session, lead } = await setup()
    const anna = await convoke(session.id, 'Anna', { role: 'activity_lead' })
    const bruno = await convoke(session.id, 'Bruno', { status: 'sent' })
    await convoke(session.id, 'Carla', { status: 'declined' })

    const staff = (await sessionGroupsOf(db, session.id)).staff
    expect(staff.map(person => [person.name, person.status])).toEqual([
      ['Bruno Staff', 'sent'],
      ['Anna Staff', 'accepted'],
    ])

    await lead('yellow', anna.id)
    await lead('red', bruno.id)
    expect(await leaders(session.id)).toEqual({ yellow: anna.id, red: bruno.id })
    // Anna moves to Rosso: Bruno steps down, Giallo is left without a leader.
    await lead('red', anna.id)
    expect(await leaders(session.id)).toEqual({ red: anna.id })
    await lead('red', null)
    expect(await leaders(session.id)).toEqual({})

    const audits = await db
      .select({ data: t.auditLog.data })
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'session.group_leader'))
    expect(audits[2]!.data).toEqual({ group: 'red', from: bruno.id, to: anna.id, left: 'yellow' })
  })

  it('refuses who is not in the session staff any more, or is in another session', async () => {
    const { session, lead } = await setup()
    const carla = await convoke(session.id, 'Carla', { status: 'declined' })
    await expect(lead('blue', carla.id)).rejects.toMatchObject({ statusCode: 404 })
    const other = await makeSession(db)
    const dario = await convoke(other.id, 'Dario')
    await expect(lead('blue', dario.id)).rejects.toMatchObject({ statusCode: 404 })

    const elena = await convoke(session.id, 'Elena')
    await db.update(t.users).set({ status: 'disabled' }).where(eq(t.users.id, elena.user.id))
    await expect(lead('blue', elena.id)).rejects.toMatchObject({ statusCode: 404 })
    expect((await sessionGroupsOf(db, session.id)).staff).toEqual([])
  })

  it('leaves the group without a leader when the leader declines or the convocation is withdrawn', async () => {
    const { session, actor, lead } = await setup()
    const anna = await convoke(session.id, 'Anna', { status: 'sent' })
    const bruno = await convoke(session.id, 'Bruno')
    await lead('yellow', anna.id)
    await lead('red', bruno.id)

    await answerConvocation(db, ctx, { id: anna.id, userId: anna.user.id, answer: 'decline' })
    await cancelConvocation(db, ctx, { id: bruno.id, actor })
    expect(await leaders(session.id)).toEqual({})
  })
})

describe('cancelling the session', () => {
  it('takes every family out of its group and leaves every group without a leader', async () => {
    const { session, actor, assign, lead } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi')
    await assign(rossi.id, 'yellow')
    await lead('yellow', (await convoke(session.id, 'Anna')).id)
    await lead('red', (await convoke(session.id, 'Bruno', { status: 'draft' })).id)

    await transitionSession(db, ctx, { sessionId: session.id, to: 'cancelled', actor })
    expect(await groupOf(rossi.id)).toBeNull()
    expect(await leaders(session.id)).toEqual({})
  })
})

describe('the CSV', () => {
  it('lists the people group by group with the leader, then the families without a group', async () => {
    const { session, assign, lead } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi', {
      cards: [
        { firstName: 'Grazia', position: 0 },
        { firstName: 'Matteo', kind: 'young', birthDate: '2021-01-01', position: 1 },
      ],
    })
    const bianchi = await join(session.id, 'Famiglia Bianchi')
    await join(session.id, 'Famiglia Verdi', { cards: [{ firstName: 'Ugo' }] })
    await assign(rossi.id, 'yellow')
    await assign(bianchi.id, 'blue')
    await lead('yellow', (await convoke(session.id, 'Anna')).id)

    const { filename, csv } = await groupsCsv(db, session.id)
    expect(filename).toBe('gruppi-sessione-di-prova-21-06-2027.csv')
    expect(csv.replace('﻿', '').trim().split('\r\n')).toEqual([
      'Gruppo;Responsabile;Famiglia;Componente;Età',
      'Giallo;Anna Staff;Famiglia Rossi;Matteo;6',
      'Giallo;Anna Staff;Famiglia Rossi;Grazia;',
      'Blu;;Famiglia Bianchi;Componenti non ancora indicati;',
      'Senza gruppo;;Famiglia Verdi;Ugo;',
    ])
  })
})
