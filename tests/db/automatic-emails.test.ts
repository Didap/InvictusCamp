import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  automaticEmailDetail,
  disabledEmailKeys,
  listAutomaticEmails,
  loadEmailTexts,
  manualEmails,
  saveEmailTexts,
  setEmailActive,
} from '../../server/domain/automatic-emails'
import { recordDisabled } from '../../server/domain/email-quota'
import { sessionConfirmedEmail } from '../../server/emails/sessions'
import { AUTOMATIC_EMAILS } from '../../shared/utils/automatic-emails'
import { makeAdmin, makeFamily, makeSession, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx = { appUrl: 'http://localhost:3080' }

describe('automatic emails', () => {
  it('saves the texts written; the defaults again count as no change', async () => {
    const admin = await makeAdmin(db)
    const texts = { ...AUTOMATIC_EMAILS['session.confirmed'].defaults, subject: 'Si parte, {nome}!' }
    await saveEmailTexts(db, { key: 'session.confirmed', texts, actorId: admin.id })

    expect(await loadEmailTexts(db)).toEqual({ 'session.confirmed': texts })
    expect(await automaticEmailDetail(db, 'session.confirmed')).toMatchObject({
      active: true,
      customized: true,
      texts,
      updatedByName: 'Giulia Conte',
    })

    await saveEmailTexts(db, {
      key: 'session.confirmed',
      texts: AUTOMATIC_EMAILS['session.confirmed'].defaults,
      actorId: admin.id,
    })
    expect(await loadEmailTexts(db)).toEqual({})
    const audits = await db.select().from(t.auditLog).where(eq(t.auditLog.entityType, 'automatic_email'))
    expect(audits.map(row => row.action)).toEqual(['email.texts', 'email.texts_reset'])
  })

  it('switches an email off and on; access links, codes and outcomes stay on', async () => {
    const admin = await makeAdmin(db)
    await setEmailActive(db, { key: 'session.confirmed', active: false, actorId: admin.id })
    expect(await disabledEmailKeys(db, ['session.confirmed', 'session.invite', 'communication'])).toEqual(
      new Set(['session.confirmed']),
    )
    const states = await listAutomaticEmails(db)
    expect(states.find(state => state.key === 'session.confirmed')).toMatchObject({ active: false, customized: false })

    await expect(setEmailActive(db, { key: 'auth.reset_password', active: false, actorId: admin.id })).rejects.toThrow(
      'non si può spegnere',
    )
    await expect(setEmailActive(db, { key: 'staff.approved', active: false, actorId: admin.id })).rejects.toThrow()

    await setEmailActive(db, { key: 'session.confirmed', active: true, actorId: admin.id })
    expect(await disabledEmailKeys(db, ['session.confirmed'])).toEqual(new Set())
  })

  it('records an email held back by the switch as disabled, outside the daily count', async () => {
    const { user } = await makeFamily(db)
    const session = await makeSession(db)
    const message = sessionConfirmedEmail(ctx, { to: user.email, toUserId: user.id, firstName: 'Anna' }, session)
    await recordDisabled(db, [message])
    const [row] = await db.select().from(t.emailLog)
    expect(row).toMatchObject({
      template: 'session.confirmed',
      status: 'disabled',
      sentAt: null,
      sessionId: session.id,
    })
  })

  it('sends by hand to the families of a session, with its facts, even when the email is off', async () => {
    const admin = await makeAdmin(db)
    const session = await makeSession(db, { title: 'Sessione di luglio' })
    const anna = await makeFamily(db)
    const luca = await makeFamily(db)
    await db.insert(t.sessionFamilies).values([
      { sessionId: session.id, familyId: anna.family.id, kind: 'slot', status: 'confirmed' },
      { sessionId: session.id, familyId: luca.family.id, kind: 'slot', status: 'declined' },
    ])
    await setEmailActive(db, { key: 'session.confirmed', active: false, actorId: admin.id })

    const messages = await manualEmails(db, ctx, {
      key: 'session.confirmed',
      audience: { type: 'session_families', sessionId: session.id, statuses: ['confirmed'] },
      actorId: admin.id,
    })
    expect(messages).toMatchObject([
      {
        template: 'session.confirmed',
        to: anna.user.email,
        sessionId: session.id,
        subject: 'Sessione confermata: Sessione di luglio',
        manual: true,
      },
    ])
    await expect(
      manualEmails(db, ctx, { key: 'session.confirmed', audience: { type: 'all_families' }, actorId: admin.id }),
    ).rejects.toThrow('non si può mandare a mano')
    await expect(
      manualEmails(db, ctx, {
        key: 'auth.reset_password',
        audience: { type: 'users', userIds: [anna.user.id] },
        actorId: admin.id,
      }),
    ).rejects.toThrow('non si può mandare a mano')
  })
})
