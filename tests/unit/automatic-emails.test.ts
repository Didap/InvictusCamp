import { describe, expect, it } from 'vitest'
import { exampleEmail } from '~~/server/domain/automatic-emails'
import { automaticEmail } from '~~/server/emails/automatic'
import { familySessionEmail } from '~~/server/emails/sessions'
import { emailTextsSchema } from '#shared/schemas/automatic-emails'
import { EMAIL_TEMPLATE_LABELS } from '#shared/schemas/communications'
import {
  AUTOMATIC_EMAIL_KEYS,
  AUTOMATIC_EMAILS,
  emailFieldIssue,
  type EmailTexts,
} from '#shared/utils/automatic-emails'

const ctx = { appUrl: 'https://gestionale.example.it' }
const recipient = { to: 'anna@example.it', toUserId: 'user-1', firstName: 'Anna' }
const session = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Sessione di giugno',
  location: 'Maruggio (TA)',
  startDate: '2027-06-21',
  endDate: '2027-06-27',
  responseDeadline: null,
}

describe('the catalog of automatic emails', () => {
  it('starts from texts that pass their own rules and the voice rules', () => {
    for (const key of AUTOMATIC_EMAIL_KEYS) {
      const { defaults } = AUTOMATIC_EMAILS[key]
      expect(emailTextsSchema(key).safeParse(defaults).success, key).toBe(true)
      for (const text of Object.values(defaults)) {
        expect(text, key).not.toMatch(/—/)
        expect(emailFieldIssue(key, text), key).toBeNull()
      }
    }
  })

  it('names every email in the log', () => {
    for (const key of AUTOMATIC_EMAIL_KEYS) expect(EMAIL_TEMPLATE_LABELS[key]).toBe(AUTOMATIC_EMAILS[key].label)
  })

  it('builds every example with its own key; access links and codes stay sensitive', () => {
    for (const key of AUTOMATIC_EMAIL_KEYS) {
      const email = exampleEmail(ctx, key, recipient)
      expect(email.template).toBe(key)
      expect(email.switchedOff).toBeUndefined()
      expect(email.sessionId).toBeNull()
      expect(Boolean(email.sensitive)).toBe(key.startsWith('auth.') || key === 'signature.otp')
    }
  })
})

describe('texts written in the dashboard', () => {
  const custom: EmailTexts = {
    ...AUTOMATIC_EMAILS['session.confirmed'].defaults,
    subject: 'Ci vediamo a {luogo}, {nome}',
    greeting: 'Cara {nome},',
    body: 'Si parte: «{sessione}», {date}.\nPorta il <cappello>.\n\nA presto!',
    actionLabel: 'Vai alla sessione',
    footnote: '',
  }

  it('fill the fields, keep the line breaks and escape what is written', () => {
    const email = familySessionEmail(
      { ...ctx, texts: { 'session.confirmed': custom } },
      'session.confirmed',
      recipient,
      session,
    )
    expect(email.subject).toBe('Ci vediamo a Maruggio (TA), Anna')
    expect(email.html).toContain('Cara Anna,')
    expect(email.html).toContain('Si parte: «Sessione di giugno», 21–27 giugno 2027.<br>Porta il &lt;cappello&gt;.')
    expect(email.html).toContain('Vai alla sessione')
    expect(email.html).toContain('https://gestionale.example.it/famiglia/sessioni')
    expect(email.text).toContain('Porta il <cappello>.\n')
  })

  it('come out switched off when the administration switched them off', () => {
    const off = new Set(['session.confirmed'])
    expect(familySessionEmail({ ...ctx, off }, 'session.confirmed', recipient, session).switchedOff).toBe(true)
    expect(exampleEmail({ ...ctx, off }, 'session.confirmed', recipient).switchedOff).toBeUndefined()
  })

  it('leave the other emails with their defaults', () => {
    const email = automaticEmail({ ...ctx, texts: { 'session.confirmed': custom } }, 'session.cancelled', {
      to: recipient.to,
      values: { nome: 'Anna', sessione: session.title },
    })
    expect(email.subject).toBe('Sessione annullata: Sessione di giugno')
  })

  it('refuse fields the email cannot fill and a button without a label', () => {
    const result = emailTextsSchema('signature.request').safeParse({
      ...AUTOMATIC_EMAILS['signature.request'].defaults,
      body: 'Firma per {sessione}.',
      actionLabel: '',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(issue => issue.path[0]).sort()).toEqual(['actionLabel', 'body'])
  })
})
