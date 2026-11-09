// Emails of the documents area: a document to read (the "to sign" one lives in ./signatures.ts) and
// the confirmation of a completed signature.
import { formatDateTime, formatDay } from '../../shared/utils/format'
import { appLink, renderEmail } from './layout'
import type { EmailContext, EmailMessage } from './types'

export function documentToReadEmail(
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
  const details = [{ label: 'Documento', value: input.documentTitle }]
  if (input.dueDate) details.push({ label: 'Da leggere entro', value: formatDay(input.dueDate, 'long') })
  const { html, text } = renderEmail(ctx, {
    preheader: `Leggi «${input.documentTitle}» nel gestionale.`,
    title: input.reminder ? 'Promemoria: un documento da leggere' : 'Hai un documento da leggere',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [
      `l’amministrazione di Invictus Camp ti chiede di leggere il documento «${input.documentTitle}».`,
      'Quando lo hai letto, confermalo nel gestionale: basta un clic.',
    ],
    details,
    action: { label: 'Leggi il documento', url: appLink(ctx, `/firma/${input.requestId}`) },
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: input.reminder ? 'signature.reminder' : 'signature.request',
    subject: `${input.reminder ? 'Promemoria: d' : 'D'}ocumento da leggere, «${input.documentTitle}»`,
    html,
    text,
    sessionId: input.sessionId ?? null,
  }
}

export function signatureSignedEmail(
  ctx: EmailContext,
  input: {
    to: string
    toUserId: string
    firstName: string
    documentTitle: string
    requestId: string
    signedAt: Date
    sessionId?: string | null
  },
): EmailMessage {
  const { html, text } = renderEmail(ctx, {
    preheader: `Hai firmato «${input.documentTitle}». La copia firmata è nel gestionale.`,
    title: 'Firma completata',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [
      `hai firmato il documento «${input.documentTitle}». Grazie.`,
      'La copia firmata, con la pagina che certifica la firma, resta sempre disponibile nel gestionale.',
    ],
    details: [
      { label: 'Documento', value: input.documentTitle },
      { label: 'Firmato il', value: formatDateTime(input.signedAt) },
    ],
    action: { label: 'Scarica la copia firmata', url: appLink(ctx, `/firma/${input.requestId}`) },
    footnote: 'Se non hai firmato tu questo documento, avvisa subito l’amministrazione del camp.',
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: 'signature.signed',
    subject: `Hai firmato «${input.documentTitle}»`,
    html,
    text,
    sessionId: input.sessionId ?? null,
  }
}
