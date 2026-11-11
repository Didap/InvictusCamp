import { describe, expect, it } from 'vitest'
import { communicationSchema, messageTemplateSchema } from '#shared/schemas/communications'
import { fillMessageFields, messageFieldValues, messageIssue } from '#shared/utils/message-fields'

const session = { title: 'Sessione 6', startDate: '2027-05-31', endDate: '2027-06-04' }
const SESSION_ID = '00000000-0000-4000-8000-000000000001'

describe('message fields', () => {
  it('fill what they know and leave the rest as written', () => {
    const values = messageFieldValues('Anna', session)
    expect(fillMessageFields('Ciao {nome}, a {sessione}, {date}.', values)).toBe(
      'Ciao Anna, a Sessione 6, 31 maggio\u2009–\u20094 giugno 2027.',
    )
    const noSession = messageFieldValues('Anna', null)
    expect(fillMessageFields('{nome} {sessione} {cognome} {constructor}', noSession)).toBe(
      'Anna {sessione} {cognome} {constructor}',
    )
    expect(fillMessageFields('Ciao {nome}', messageFieldValues('', null))).toBe('Ciao {nome}')
  })

  it('stop a message with parts to complete, unknown fields, or session fields without a session', () => {
    expect(messageIssue('Ritrovo [orario] in piazza', true)).toBe('Completa [orario] prima dell’invio.')
    expect(messageIssue('Ciao {cognome}', true)).toContain('{cognome} non si compila da solo')
    expect(messageIssue('Ciao {constructor}', true)).toBe(
      '{constructor} non si compila da solo: usa {nome}, {sessione} o {date}.',
    )
    expect(messageIssue('A presto a {sessione}', false)).toBe(
      '{sessione} si compila solo se scrivi alle famiglie o allo staff di una sessione.',
    )
    expect(messageIssue('Ciao {nome}, a {sessione} {date}', true)).toBeNull()
    expect(messageIssue('Ciao {nome}', false)).toBeNull()
    expect(messageIssue('Una parentesi [aperta\nsu due righe]', false)).toBeNull()
  })

  it('the send schema says where the problem is; a template may keep parts to complete', () => {
    const sent = communicationSchema.safeParse({
      subject: 'Ti aspettiamo a {sessione}',
      body: 'Ritrovo [orario]',
      audience: { type: 'all_staff' },
    })
    expect(sent.success).toBe(false)
    expect(sent.error?.issues.map(issue => issue.path.join('.')).sort()).toEqual(['body', 'subject'])

    const toSession = communicationSchema.safeParse({
      subject: 'Ti aspettiamo a {sessione}',
      body: 'Ciao {nome}, {date}',
      audience: { type: 'session_staff', sessionId: SESSION_ID },
    })
    expect(toSession.success).toBe(true)

    expect(
      messageTemplateSchema.safeParse({ name: 'Convocazione', subject: '{sessione}', body: 'Ritrovo [orario]' })
        .success,
    ).toBe(true)
    const typo = messageTemplateSchema.safeParse({ name: 'Convocazione', subject: 'Ciao', body: 'Ciao {nmoe}' })
    expect(typo.error?.issues[0]?.path).toEqual(['body'])
  })
})
