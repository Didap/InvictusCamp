import { describe, expect, it } from 'vitest'
import { inviteEmail } from '~~/server/emails/auth'
import { renderEmail } from '~~/server/emails/layout'
import { signatureOtpEmail } from '~~/server/emails/signatures'

const ctx = { appUrl: 'https://gestionale.invictuscamp.it' }

describe('emails', () => {
  it('escapes everything that comes from people', () => {
    const { html, text } = renderEmail(ctx, {
      title: 'Prova <b>titolo</b>',
      paragraphs: ['Ciao <script>alert(1)</script> & benvenuti'],
      details: [{ label: 'Famiglia', value: '"Rossi"' }],
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;Rossi&quot;')
    expect(text).toContain('Ciao <script>alert(1)</script> & benvenuti')
  })

  it('keeps access links out of the log and points them at the app', () => {
    const message = inviteEmail(ctx, {
      to: 'anna@example.com',
      toUserId: 'u1',
      firstName: 'Anna',
      role: 'family',
      token: 'tok_123',
    })
    expect(message.sensitive).toBe(true)
    expect(message.devNote).toBe('https://gestionale.invictuscamp.it/invito?token=tok_123')
    expect(message.html).toContain('https://gestionale.invictuscamp.it/invito?token=tok_123')
    expect(message.subject).not.toContain('tok_123')
  })

  it('never puts the signature code in the subject', () => {
    const message = signatureOtpEmail(ctx, {
      to: 'a@example.com',
      toUserId: 'u1',
      firstName: 'Anna',
      documentTitle: 'Regolamento',
      code: '481516',
    })
    expect(message.subject).not.toContain('481516')
    expect(message.text).toContain('481516')
    expect(message.sensitive).toBe(true)
  })
})
