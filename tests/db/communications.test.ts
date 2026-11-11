import { and, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  deleteDraft,
  getCommunication,
  listCommunications,
  resolveAudience,
  saveDraft,
  sendCommunication,
  updateDraft,
} from '../../server/domain/audiences'
import {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
} from '../../server/domain/message-templates'
import { inviteUser, listUsers, resendInvite, sendPasswordReset, setUserEnabled } from '../../server/domain/users'
import { issueToken } from '../../server/domain/tokens'
import { bodyParagraphs } from '../../server/emails/communications'
import { describeAudience } from '../../shared/schemas/communications'
import type { Audience } from '../../shared/types/domain'
import { makeAdmin, makeFamily, makeSession, makeStaff, makeUser, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx = { appUrl: 'http://localhost:3080' }

const ids = (resolved: { recipients: { userId: string }[] }) => resolved.recipients.map(r => r.userId).sort()
const sorted = (...values: string[]) => [...values].sort()

async function participate(
  sessionId: string,
  familyId: string,
  kind: 'slot' | 'reserve',
  status: (typeof t.sessionFamilies.$inferInsert)['status'],
) {
  await db
    .insert(t.sessionFamilies)
    .values({ sessionId, familyId, kind, status, reserveRank: kind === 'reserve' ? 1 : null })
}

describe('audiences', () => {
  it('all families: active accounts with a confirmed address, nobody else', async () => {
    const anna = await makeFamily(db)
    const luca = await makeFamily(db)
    const disabled = await makeFamily(db)
    await db.update(t.users).set({ status: 'disabled' }).where(eq(t.users.id, disabled.user.id))
    const invited = await makeUser(db, { role: 'family', status: 'invited', emailVerifiedAt: null })
    await makeUser(db, { role: 'family', emailVerifiedAt: null })
    await makeStaff(db)
    await makeAdmin(db)

    const resolved = await resolveAudience(db, { type: 'all_families' })
    expect(ids(resolved)).toEqual(sorted(anna.user.id, luca.user.id))
    expect(resolved.excluded).toBe(3)
    expect(resolved.recipients.map(r => r.userId)).not.toContain(invited.id)
  })

  it('all staff: approved profiles only', async () => {
    const approved = await makeStaff(db, 'approved')
    const disabled = await makeStaff(db, 'approved')
    await db.update(t.users).set({ status: 'disabled' }).where(eq(t.users.id, disabled.user.id))
    for (const status of ['registered', 'applied', 'rejected', 'inactive'] as const) await makeStaff(db, status)
    await makeFamily(db)

    const resolved = await resolveAudience(db, { type: 'all_staff' })
    expect(ids(resolved)).toEqual([approved.user.id])
    expect(resolved.excluded).toBe(1)
  })

  it('staff candidates: applications to review only', async () => {
    const first = await makeStaff(db, 'applied')
    const second = await makeStaff(db, 'applied')
    await makeStaff(db, 'approved')
    await makeStaff(db, 'registered')

    const resolved = await resolveAudience(db, { type: 'staff_candidates' })
    expect(ids(resolved)).toEqual(sorted(first.user.id, second.user.id))
    expect(resolved.excluded).toBe(0)
  })

  it('families of a session: by kind and status, never another session', async () => {
    const session = await makeSession(db)
    const other = await makeSession(db, { title: 'Altra sessione' })
    const titolareInvited = await makeFamily(db)
    const titolareConfirmed = await makeFamily(db)
    const titolareSelected = await makeFamily(db)
    const titolareDeclined = await makeFamily(db)
    const reserveInvited = await makeFamily(db)
    const disabled = await makeFamily(db)
    const elsewhere = await makeFamily(db)
    await participate(session.id, titolareInvited.family.id, 'slot', 'invited')
    await participate(session.id, titolareConfirmed.family.id, 'slot', 'confirmed')
    await participate(session.id, titolareSelected.family.id, 'slot', 'selected')
    await participate(session.id, titolareDeclined.family.id, 'slot', 'declined')
    await participate(session.id, reserveInvited.family.id, 'reserve', 'invited')
    await participate(session.id, disabled.family.id, 'slot', 'confirmed')
    await participate(other.id, elsewhere.family.id, 'slot', 'confirmed')
    await db.update(t.users).set({ status: 'disabled' }).where(eq(t.users.id, disabled.user.id))

    const everyone = await resolveAudience(db, { type: 'session_families', sessionId: session.id })
    expect(everyone.recipients).toHaveLength(5)
    expect(everyone.excluded).toBe(1)
    expect(ids(everyone)).not.toContain(elsewhere.user.id)

    const answering: Audience = { type: 'session_families', sessionId: session.id, statuses: ['invited', 'confirmed'] }
    expect(ids(await resolveAudience(db, answering))).toEqual(
      sorted(titolareInvited.user.id, titolareConfirmed.user.id, reserveInvited.user.id),
    )

    const titolari = await resolveAudience(db, { ...answering, kinds: ['slot'] })
    expect(ids(titolari)).toEqual(sorted(titolareInvited.user.id, titolareConfirmed.user.id))

    const reserves = await resolveAudience(db, { type: 'session_families', sessionId: session.id, kinds: ['reserve'] })
    expect(ids(reserves)).toEqual([reserveInvited.user.id])

    const none = await resolveAudience(db, { type: 'session_families', sessionId: session.id, statuses: [] })
    expect(none.recipients).toHaveLength(0)
  })

  it('staff of a session: by convocation status', async () => {
    const session = await makeSession(db)
    const other = await makeSession(db)
    const sent = await makeStaff(db)
    const accepted = await makeStaff(db)
    const draft = await makeStaff(db)
    const declined = await makeStaff(db)
    const elsewhere = await makeStaff(db)
    await db.insert(t.sessionStaff).values([
      { sessionId: session.id, userId: sent.user.id, status: 'sent' },
      { sessionId: session.id, userId: accepted.user.id, status: 'accepted' },
      { sessionId: session.id, userId: draft.user.id, status: 'draft' },
      { sessionId: session.id, userId: declined.user.id, status: 'declined' },
      { sessionId: other.id, userId: elsewhere.user.id, status: 'accepted' },
    ])

    const everyone = await resolveAudience(db, { type: 'session_staff', sessionId: session.id })
    expect(everyone.recipients).toHaveLength(4)

    const convoked = await resolveAudience(db, {
      type: 'session_staff',
      sessionId: session.id,
      statuses: ['sent', 'accepted'],
    })
    expect(ids(convoked)).toEqual(sorted(sent.user.id, accepted.user.id))
  })

  it('a session that does not exist is a 404', async () => {
    await expect(
      resolveAudience(db, { type: 'session_staff', sessionId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('chosen people: each once, any role, inactive accounts excluded, unknown ids ignored', async () => {
    const family = await makeFamily(db)
    const staff = await makeStaff(db, 'registered')
    const admin = await makeAdmin(db)
    const disabled = await makeUser(db, { status: 'disabled' })
    const resolved = await resolveAudience(db, {
      type: 'users',
      userIds: [
        family.user.id,
        staff.user.id,
        family.user.id,
        admin.id,
        disabled.id,
        '00000000-0000-4000-8000-000000000000',
      ],
    })
    expect(ids(resolved)).toEqual(sorted(family.user.id, staff.user.id, admin.id))
    expect(resolved.excluded).toBe(1)
  })

  it('recipients are sorted by surname', async () => {
    const rossi = await makeUser(db, { lastName: 'Rossi' })
    const bianchi = await makeUser(db, { lastName: 'Bianchi' })
    const resolved = await resolveAudience(db, { type: 'users', userIds: [rossi.id, bianchi.id] })
    expect(resolved.recipients.map(r => r.lastName)).toEqual(['Bianchi', 'Rossi'])
  })
})

describe('communications', () => {
  it('sending records the message and returns one email per recipient', async () => {
    const admin = await makeAdmin(db)
    const session = await makeSession(db)
    const anna = await makeFamily(db)
    const luca = await makeFamily(db)
    await participate(session.id, anna.family.id, 'slot', 'confirmed')
    await participate(session.id, luca.family.id, 'reserve', 'invited')

    const result = await sendCommunication(db, ctx, {
      subject: 'Orari di arrivo',
      body: 'Care famiglie,\n\nl’arrivo è alle <10>.\nPortate il cappello.',
      audience: { type: 'session_families', sessionId: session.id },
      sentBy: admin.id,
    })
    expect(result.messages).toHaveLength(2)
    const [row] = await db.select().from(t.communications).where(eq(t.communications.id, result.communicationId))
    expect(row).toMatchObject({
      recipientCount: 2,
      sessionId: session.id,
      sentBy: admin.id,
      subject: 'Orari di arrivo',
    })
    expect(row!.sentAt).toBeInstanceOf(Date)

    const message = result.messages[0]!
    expect(message).toMatchObject({
      template: 'communication',
      subject: 'Orari di arrivo',
      communicationId: result.communicationId,
      sessionId: session.id,
    })
    expect(message.sensitive).toBeFalsy()
    expect(message.html).toContain('l’arrivo è alle &lt;10&gt;.<br>Portate il cappello.')
    expect(message.html).not.toContain('\u2028')
    expect(message.text).toContain('l’arrivo è alle <10>.\nPortate il cappello.')
  })

  it('the fields are filled for each recipient; the message keeps them as written', async () => {
    const admin = await makeAdmin(db)
    const session = await makeSession(db, { title: 'Sessione 6', startDate: '2027-05-31', endDate: '2027-06-04' })
    const anna = await makeFamily(db)
    await db.update(t.users).set({ firstName: 'Anna' }).where(eq(t.users.id, anna.user.id))
    await participate(session.id, anna.family.id, 'slot', 'confirmed')

    const result = await sendCommunication(db, ctx, {
      subject: 'Ti aspettiamo a {sessione}',
      body: 'Ciao {nome},\n\nci vediamo {date}.',
      audience: { type: 'session_families', sessionId: session.id },
      sentBy: admin.id,
    })
    const message = result.messages[0]!
    expect(message.subject).toBe('Ti aspettiamo a Sessione 6')
    expect(message.text).toContain('Ciao Anna,')
    expect(message.text).toContain('ci vediamo 31 maggio\u2009–\u20094 giugno 2027.')
    const [row] = await db.select().from(t.communications).where(eq(t.communications.id, result.communicationId))
    expect(row).toMatchObject({ subject: 'Ti aspettiamo a {sessione}', body: 'Ciao {nome},\n\nci vediamo {date}.' })
  })

  it('an audience that reaches nobody is refused', async () => {
    const admin = await makeAdmin(db)
    await expect(
      sendCommunication(db, ctx, { subject: 'Ciao', body: 'Testo', audience: { type: 'all_staff' }, sentBy: admin.id }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(await db.select().from(t.communications)).toHaveLength(0)
  })

  it('a draft is saved, edited, sent once, and can no longer change', async () => {
    const admin = await makeAdmin(db)
    const anna = await makeFamily(db)
    const id = await saveDraft(db, {
      subject: 'Bozza',
      body: '',
      audience: { type: 'all_families' },
      authorId: admin.id,
    })
    const [draft] = await db.select().from(t.communications).where(eq(t.communications.id, id))
    expect(draft!.sentAt).toBeNull()

    await updateDraft(db, id, {
      subject: 'Bozza aggiornata',
      body: 'Testo',
      audience: { type: 'users', userIds: [anna.user.id] },
      authorId: admin.id,
    })
    const sent = await sendCommunication(db, ctx, {
      subject: 'Pronta',
      body: 'Testo finale',
      audience: { type: 'users', userIds: [anna.user.id] },
      sentBy: admin.id,
      draftId: id,
    })
    expect(sent.communicationId).toBe(id)
    expect(sent.messages.map(m => m.to)).toEqual([anna.user.email])

    const again = { subject: 'Di nuovo', body: 'Testo', audience: { type: 'all_families' } as Audience }
    await expect(sendCommunication(db, ctx, { ...again, sentBy: admin.id, draftId: id })).rejects.toMatchObject({
      statusCode: 409,
    })
    await expect(updateDraft(db, id, { ...again, authorId: admin.id })).rejects.toMatchObject({ statusCode: 409 })
    await expect(deleteDraft(db, id)).rejects.toMatchObject({ statusCode: 409 })
    expect(await db.select().from(t.communications)).toHaveLength(1)
  })

  it('a draft can be deleted', async () => {
    const admin = await makeAdmin(db)
    const id = await saveDraft(db, { subject: 'Bozza', body: '', audience: { type: 'all_staff' }, authorId: admin.id })
    await deleteDraft(db, id)
    expect(await db.select().from(t.communications)).toHaveLength(0)
    await expect(deleteDraft(db, id)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('email templates', () => {
  it('the examples come with the migrations and survive the reset of the demo data', async () => {
    const names = (await listMessageTemplates(db)).map(template => template.name)
    expect(names).toEqual(
      expect.arrayContaining(['Convocazione famiglie', 'Convocazione staff', 'Promemoria documenti']),
    )
  })

  it('are added, edited and deleted; an unknown id is a 404', async () => {
    const input = { name: 'Zaini', subject: 'Cosa mettere nello zaino', body: 'Ciao {nome},\n\nporta [cosa].' }
    const id = await createMessageTemplate(db, input)
    expect((await listMessageTemplates(db)).find(template => template.id === id)).toMatchObject(input)

    await updateMessageTemplate(db, id, { ...input, subject: 'Lo zaino' })
    expect((await listMessageTemplates(db)).find(template => template.id === id)?.subject).toBe('Lo zaino')

    await deleteMessageTemplate(db, id)
    expect((await listMessageTemplates(db)).some(template => template.id === id)).toBe(false)
    await expect(deleteMessageTemplate(db, id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateMessageTemplate(db, id, input)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('accounts', () => {
  it('inviting a family creates the account, the family with its referent and the invitation', async () => {
    const admin = await makeAdmin(db)
    const { user, messages } = await inviteUser(
      db,
      ctx,
      { role: 'family', firstName: 'Anna', lastName: 'Verdi', email: 'anna.verdi@test.local' },
      { userId: admin.id },
    )
    expect(user).toMatchObject({ status: 'invited', passwordHash: null, role: 'family' })
    const [family] = await db.select().from(t.families).where(eq(t.families.userId, user.id))
    expect(family!.name).toBe('Famiglia Verdi')
    const members = await db.select().from(t.familyMembers).where(eq(t.familyMembers.familyId, family!.id))
    expect(members).toMatchObject([{ firstName: 'Anna', isReferent: true }])
    const tokens = await db.select().from(t.authTokens).where(eq(t.authTokens.userId, user.id))
    expect(tokens).toMatchObject([{ purpose: 'invite', usedAt: null }])
    expect(messages).toMatchObject([{ template: 'auth.invite', to: 'anna.verdi@test.local', sensitive: true }])
    const [entry] = await db.select().from(t.auditLog).where(eq(t.auditLog.entityId, user.id))
    expect(entry).toMatchObject({ action: 'user.invite', actorUserId: admin.id })
  })

  it('inviting staff sets the starting status; the same email twice is refused', async () => {
    const admin = await makeAdmin(db)
    const { user } = await inviteUser(
      db,
      ctx,
      { role: 'staff', firstName: 'Luca', lastName: 'Neri', email: 'luca@test.local', staffStatus: 'approved' },
      { userId: admin.id },
    )
    const [profile] = await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.userId, user.id))
    expect(profile).toMatchObject({ status: 'approved', reviewedBy: admin.id })
    await expect(
      inviteUser(
        db,
        ctx,
        { role: 'admin', firstName: 'Luca', lastName: 'Neri', email: 'luca@test.local' },
        { userId: admin.id },
      ),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('the invitation is sent again only to invited accounts, and the old link stops working', async () => {
    const admin = await makeAdmin(db)
    const invited = await makeUser(db, { status: 'invited', emailVerifiedAt: null })
    await issueToken(db, invited.id, 'invite')
    const { messages } = await resendInvite(db, ctx, invited.id, { userId: admin.id })
    expect(messages).toMatchObject([{ template: 'auth.invite' }])
    const open = await db
      .select()
      .from(t.authTokens)
      .where(and(eq(t.authTokens.userId, invited.id), isNull(t.authTokens.usedAt)))
    expect(open).toHaveLength(1)

    const active = await makeUser(db, { passwordHash: 'hash' })
    await expect(resendInvite(db, ctx, active.id, { userId: admin.id })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('disable and enable: never yourself, links retired, back to the right status, audited', async () => {
    const admin = await makeAdmin(db)
    await expect(setUserEnabled(db, admin.id, false, { userId: admin.id })).rejects.toMatchObject({ statusCode: 400 })

    const active = await makeUser(db, { passwordHash: 'hash' })
    await issueToken(db, active.id, 'reset_password')
    const disabled = await setUserEnabled(db, active.id, false, { userId: admin.id })
    expect(disabled.status).toBe('disabled')
    const open = await db
      .select()
      .from(t.authTokens)
      .where(and(eq(t.authTokens.userId, active.id), isNull(t.authTokens.usedAt)))
    expect(open).toHaveLength(0)
    expect((await setUserEnabled(db, active.id, true, { userId: admin.id })).status).toBe('active')

    const invited = await makeUser(db, { status: 'invited', emailVerifiedAt: null })
    await setUserEnabled(db, invited.id, false, { userId: admin.id })
    expect((await setUserEnabled(db, invited.id, true, { userId: admin.id })).status).toBe('invited')

    const actions = (await db.select().from(t.auditLog).where(eq(t.auditLog.entityId, active.id))).map(e => e.action)
    expect(actions.sort()).toEqual(['user.disable', 'user.enable'])
  })

  it('password reset: a reset link to active accounts, an invitation to invited ones, nothing to disabled ones', async () => {
    const admin = await makeAdmin(db)
    const active = await makeUser(db, { passwordHash: 'hash' })
    expect((await sendPasswordReset(db, ctx, active.id, { userId: admin.id })).messages).toMatchObject([
      { template: 'auth.reset_password', sensitive: true },
    ])
    const invited = await makeUser(db, { status: 'invited', emailVerifiedAt: null })
    expect((await sendPasswordReset(db, ctx, invited.id, { userId: admin.id })).messages).toMatchObject([
      { template: 'auth.invite' },
    ])
    const disabled = await makeUser(db, { status: 'disabled', passwordHash: 'hash' })
    await expect(sendPasswordReset(db, ctx, disabled.id, { userId: admin.id })).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('reading', () => {
  it('lists messages with drafts first, by session, and shows how each email went', async () => {
    const admin = await makeAdmin(db)
    const session = await makeSession(db, { title: 'Sessione di luglio' })
    const anna = await makeFamily(db)
    await participate(session.id, anna.family.id, 'slot', 'confirmed')
    const sent = await sendCommunication(
      db,
      ctx,
      {
        subject: 'Promemoria',
        body: 'Testo',
        audience: { type: 'session_families', sessionId: session.id },
        sentBy: admin.id,
      },
      new Date('2027-05-01T10:00:00Z'),
    )
    const draftId = await saveDraft(db, {
      subject: 'Bozza',
      body: '',
      audience: { type: 'all_staff' },
      authorId: admin.id,
    })

    const all = await listCommunications(db, { page: 1, pageSize: 20 })
    expect(all.total).toBe(2)
    expect(all.items.map(item => item.id)).toEqual([draftId, sent.communicationId])
    expect(all.items[1]).toMatchObject({
      audienceLabel: 'Famiglie di «Sessione di luglio» (titolari e riserve)',
      sentByName: 'Giulia Conte',
      sessionTitle: 'Sessione di luglio',
    })
    const ofSession = await listCommunications(db, { sessionId: session.id, page: 1, pageSize: 20 })
    expect(ofSession.items.map(item => item.id)).toEqual([sent.communicationId])

    await db.insert(t.emailLog).values(
      sent.messages.map(message => ({
        template: message.template,
        toEmail: message.to,
        toUserId: message.toUserId,
        subject: message.subject,
        html: message.html,
        status: 'failed' as const,
        error: 'Indirizzo inesistente',
        communicationId: message.communicationId,
      })),
    )
    const detail = await getCommunication(db, sent.communicationId)
    expect(detail.delivery).toEqual({ sent: 0, failed: 1, simulated: 0 })
    expect(detail.recipients).toMatchObject([
      { userId: anna.user.id, status: 'failed', error: 'Indirizzo inesistente' },
    ])
    await expect(getCommunication(db, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('lists accounts: search, filters, chosen ids, invitations still valid', async () => {
    const rossi = await makeFamily(db, { name: 'Famiglia Rossi' })
    await db.update(t.users).set({ firstName: 'Maria', lastName: 'Bianchi' }).where(eq(t.users.id, rossi.user.id))
    const staff = await makeStaff(db, 'applied')
    const invited = await makeUser(db, { role: 'staff', status: 'invited', emailVerifiedAt: null, lastName: 'Zeta' })
    await issueToken(db, invited.id, 'invite')
    const expired = await makeUser(db, { status: 'invited', emailVerifiedAt: null, lastName: 'Zorzi' })
    await issueToken(db, expired.id, 'invite', new Date('2026-01-01T00:00:00Z'))
    const query = { page: 1, pageSize: 25 }

    const byFamily = await listUsers(db, { ...query, q: 'rossi' })
    expect(byFamily.items.map(u => u.id)).toEqual([rossi.user.id])
    expect(byFamily.items[0]).toMatchObject({ familyId: rossi.family.id, familyName: 'Famiglia Rossi' })
    expect(byFamily.items[0]).not.toHaveProperty('passwordHash')
    expect((await listUsers(db, { ...query, q: 'maria bian' })).items.map(u => u.id)).toEqual([rossi.user.id])
    expect((await listUsers(db, { ...query, q: '100%' })).total).toBe(0)

    const staffOnly = await listUsers(db, { ...query, role: 'staff' })
    expect(staffOnly.items.map(u => u.id).sort()).toEqual([staff.user.id, invited.id].sort())
    expect(staffOnly.items.find(u => u.id === staff.user.id)?.staffStatus).toBe('applied')

    const pending = await listUsers(db, { ...query, status: 'invited' })
    expect(pending.items.map(u => [u.lastName, u.inviteExpiresAt !== null])).toEqual([
      ['Zeta', true],
      ['Zorzi', false],
    ])

    const chosen = await listUsers(db, { ...query, ids: [staff.user.id] })
    expect(chosen.items.map(u => u.id)).toEqual([staff.user.id])
    expect((await listUsers(db, { ...query, ids: [] })).total).toBe(0)

    const firstPage = await listUsers(db, { page: 1, pageSize: 2 })
    expect(firstPage.items).toHaveLength(2)
    expect(firstPage.total).toBe(4)
  })
})

describe('labels and text', () => {
  it('describe each audience in one line', () => {
    const sessionId = '00000000-0000-4000-8000-000000000000'
    expect(describeAudience({ type: 'all_families' })).toBe('Tutte le famiglie')
    expect(describeAudience({ type: 'staff_candidates' })).toBe('Candidature da valutare')
    expect(
      describeAudience(
        { type: 'session_families', sessionId, kinds: ['slot'], statuses: ['invited', 'confirmed'] },
        'Luglio',
      ),
    ).toBe('Famiglie di «Luglio» (solo titolari; stato: invitata o confermata)')
    expect(describeAudience({ type: 'session_staff', sessionId, statuses: ['sent', 'accepted'] }, 'Luglio')).toBe(
      'Staff di «Luglio» (convocazione: inviata o accettata)',
    )
    expect(describeAudience({ type: 'users', userIds: [sessionId, sessionId] })).toBe('1 persona scelta')
  })

  it('split a plain text body into paragraphs, keeping single line breaks', () => {
    expect(bodyParagraphs('Ciao,\r\n\r\n\nprima riga\nseconda riga  \n\n   \n')).toEqual([
      'Ciao,',
      'prima riga\u2028seconda riga',
    ])
  })
})
