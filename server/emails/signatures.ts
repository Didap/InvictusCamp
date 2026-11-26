// Emails of the signature flow shared by several areas: a document to sign or to read (sent by the
// documents area and by the staff area when a convocation is accepted), its reminder, and the one-time
// code that confirms a signature. Their texts live in shared/utils/automatic-emails.ts.
import { formatDay } from '../../shared/utils/format'
import { automaticEmail } from './automatic'
import { appLink } from './layout'
import type { EmailContext, EmailMessage } from './types'

interface DocumentEmailInput {
  to: string
  toUserId: string
  firstName: string
  documentTitle: string
  requestId: string
  dueDate?: string | null
  sessionId?: string | null
  reminder?: boolean
}

/** The email of a request, by what it asks: [first email, reminder]. */
const REQUEST_KEYS = {
  sign: ['signature.request', 'signature.reminder'],
  read: ['document.read', 'document.read_reminder'],
} as const

/** A document to read or to sign, or its reminder: the link opens the request. */
export function documentRequestEmail(
  ctx: EmailContext,
  input: DocumentEmailInput & { requiresSignature: boolean },
): EmailMessage {
  const sign = input.requiresSignature
  const key = REQUEST_KEYS[sign ? 'sign' : 'read'][input.reminder ? 1 : 0]
  const details = [{ label: 'Documento', value: input.documentTitle }]
  if (input.dueDate) {
    details.push({ label: sign ? 'Da firmare entro' : 'Da leggere entro', value: formatDay(input.dueDate, 'long') })
  }
  return automaticEmail(ctx, key, {
    to: input.to,
    toUserId: input.toUserId,
    values: { nome: input.firstName, documento: input.documentTitle },
    details,
    actionUrl: appLink(ctx, `/firma/${input.requestId}`),
    sessionId: input.sessionId ?? null,
  })
}

export function signatureOtpEmail(
  ctx: EmailContext,
  input: { to: string; toUserId: string; firstName: string; documentTitle: string; code: string },
): EmailMessage {
  return automaticEmail(ctx, 'signature.otp', {
    to: input.to,
    toUserId: input.toUserId,
    values: { nome: input.firstName, documento: input.documentTitle },
    details: [{ label: 'Codice', value: input.code }],
    sensitive: true,
    devNote: `codice ${input.code}`,
  })
}
