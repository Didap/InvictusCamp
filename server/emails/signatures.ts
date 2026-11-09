// Emails of the signature flow shared by several areas: a document to sign (sent by the documents
// area and by the staff area when a convocation is accepted) and the one-time code that confirms
// a signature.
import { formatDay } from '../../shared/utils/format'
import { appLink, renderEmail } from './layout'
import type { EmailContext, EmailMessage } from './types'

export function signatureRequestEmail(
  ctx: EmailContext,
  input: {
    to: string
    toUserId: string
    firstName: string
    documentTitle: string
    requestId: string
    dueDate?: string | null
    sessionId?: string | null
    reminder?: boolean
  },
): EmailMessage {
  const url = appLink(ctx, `/firma/${input.requestId}`)
  const details = [{ label: 'Documento', value: input.documentTitle }]
  if (input.dueDate) details.push({ label: 'Da firmare entro', value: formatDay(input.dueDate, 'long') })
  const { html, text } = renderEmail(ctx, {
    preheader: `Leggi e firma «${input.documentTitle}» nel gestionale.`,
    title: input.reminder ? 'Promemoria: un documento da firmare' : 'Hai un documento da firmare',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [
      `l’amministrazione di Invictus Camp ti chiede di leggere e firmare il documento «${input.documentTitle}».`,
      'La firma si fa nel gestionale: ti invieremo via email un codice per confermarla.',
    ],
    details,
    action: { label: 'Leggi e firma', url },
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: input.reminder ? 'signature.reminder' : 'signature.request',
    subject: `${input.reminder ? 'Promemoria: d' : 'D'}ocumento da firmare, «${input.documentTitle}»`,
    html,
    text,
    sessionId: input.sessionId ?? null,
  }
}

export function signatureOtpEmail(
  ctx: EmailContext,
  input: { to: string; toUserId: string; firstName: string; documentTitle: string; code: string },
): EmailMessage {
  const { html, text } = renderEmail(ctx, {
    preheader: 'Il codice per confermare la tua firma. Vale 10 minuti.',
    title: 'Il codice per confermare la firma',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [`per firmare «${input.documentTitle}» inserisci questo codice nel gestionale. Vale 10 minuti.`],
    details: [{ label: 'Codice', value: input.code }],
    footnote: 'Se non stai firmando un documento, non usare il codice e avvisa l’amministrazione del camp.',
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: 'signature.otp',
    subject: 'Il tuo codice per firmare il documento',
    html,
    text,
    sensitive: true,
    devNote: `codice ${input.code}`,
  }
}
