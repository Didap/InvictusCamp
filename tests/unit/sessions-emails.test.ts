import { describe, expect, it } from 'vitest'
import {
  sessionCancelledEmail,
  sessionConfirmedEmail,
  sessionInviteEmail,
  sessionRemovedEmail,
  sessionReserveEmail,
  sessionSlotOfferedEmail,
} from '../../server/emails/sessions'

const ctx = { appUrl: 'https://gestionale.example.it' }
const to = { to: 'anna@example.it', toUserId: 'user-1', firstName: 'Anna' }
const session = {
  id: 'session-1',
  title: 'Sessione 1 · <Giugno> 2027',
  location: 'Invictus Camp, Maruggio (TA)',
  startDate: '2027-06-21',
  endDate: '2027-06-27',
  responseDeadline: '2027-05-15',
}

const all = [
  sessionInviteEmail(ctx, to, session),
  sessionInviteEmail(ctx, to, session, { reminder: true }),
  sessionReserveEmail(ctx, to, session),
  sessionSlotOfferedEmail(ctx, to, session),
  sessionConfirmedEmail(ctx, to, session),
  sessionCancelledEmail(ctx, to, session),
  sessionRemovedEmail(ctx, to, session, 'slot'),
  sessionRemovedEmail(ctx, to, session, 'reserve'),
]

describe('session emails', () => {
  it('use the documented templates and subjects, tied to the session', () => {
    expect(all.map(email => [email.template, email.subject])).toEqual([
      ['session.invite', `Invito: ${session.title}`],
      ['session.invite', `Promemoria invito: ${session.title}`],
      ['session.reserve', `Lista di riserva: ${session.title}`],
      ['session.slot_offered', `Si è liberato un posto: ${session.title}`],
      ['session.confirmed', `Sessione confermata: ${session.title}`],
      ['session.cancelled', `Sessione annullata: ${session.title}`],
      ['session.removed', `Partecipazione annullata: ${session.title}`],
      ['session.removed', `Partecipazione annullata: ${session.title}`],
    ])
    for (const email of all) {
      expect(email).toMatchObject({ to: to.to, toUserId: to.toUserId, sessionId: session.id })
      expect(email.sensitive).toBeFalsy()
    }
  })

  it('ask for an answer by the deadline only where an answer is expected', () => {
    const withDeadline = all.filter(email => email.text.includes('Rispondi entro: 15 maggio 2027'))
    expect(withDeadline.map(email => email.template)).toEqual([
      'session.invite',
      'session.invite',
      'session.slot_offered',
    ])
    expect(all[0]!.text).toContain('https://gestionale.example.it/famiglia/sessioni')
    expect(all[0]!.text).toContain('Date: 21–27 giugno 2027')
  })

  it('escape the session title and follow the voice rules', () => {
    for (const email of all) {
      expect(email.html).not.toContain('<Giugno>')
      expect(email.html).toContain('&lt;Giugno&gt;')
      expect(email.text).toContain('Ciao Anna,')
      expect(`${email.subject}${email.text}`).not.toMatch(/[—!]/)
    }
  })

  it('tell a reserve it left the list, a titolare that the participation was cancelled', () => {
    expect(all[6]!.text).toContain('è stata annullata dall’amministrazione')
    expect(all[7]!.text).toContain('non è più nella lista di riserva')
  })
})
