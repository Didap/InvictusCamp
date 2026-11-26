// Emails of the documents area: a document to read (the "to sign" one lives in ./signatures.ts) and
// the confirmation of a completed signature. Their texts live in shared/utils/automatic-emails.ts.
import { formatDateTime } from '../../shared/utils/format'
import { automaticEmail } from './automatic'
import { appLink } from './layout'
import { documentRequestEmail, type DocumentEmailInput } from './signatures'
import type { EmailContext, EmailMessage } from './types'

export function documentToReadEmail(ctx: EmailContext, input: DocumentEmailInput): EmailMessage {
  return documentRequestEmail(ctx, { ...input, requiresSignature: false })
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
  return automaticEmail(ctx, 'signature.signed', {
    to: input.to,
    toUserId: input.toUserId,
    values: { nome: input.firstName, documento: input.documentTitle },
    details: [
      { label: 'Documento', value: input.documentTitle },
      { label: 'Firmato il', value: formatDateTime(input.signedAt) },
    ],
    actionUrl: appLink(ctx, `/firma/${input.requestId}`),
    sessionId: input.sessionId ?? null,
  })
}
