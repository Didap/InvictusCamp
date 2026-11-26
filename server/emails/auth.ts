// Access emails: invitation, address confirmation, password reset. They carry one-time links, so
// they are `sensitive` (not kept in email_log) and, when simulated in development, the link is
// printed in the server console. Their texts live in shared/utils/automatic-emails.ts.
import type { UserRole } from '../../shared/utils/constants'
import { automaticEmail } from './automatic'
import { appLink } from './layout'
import type { EmailContext, EmailMessage } from './types'

interface Recipient {
  to: string
  toUserId: string
  firstName: string
}

const INVITE_TEMPLATE = {
  admin: 'auth.invite_admin',
  family: 'auth.invite_family',
  staff: 'auth.invite_staff',
} as const satisfies Record<UserRole, string>

function accessEmail(
  ctx: EmailContext,
  key: 'auth.verify_email' | 'auth.reset_password' | (typeof INVITE_TEMPLATE)[UserRole],
  input: Recipient,
  url: string,
): EmailMessage {
  return automaticEmail(ctx, key, {
    to: input.to,
    toUserId: input.toUserId,
    values: { nome: input.firstName },
    actionUrl: url,
    sensitive: true,
    devNote: url,
  })
}

export function inviteEmail(ctx: EmailContext, input: Recipient & { role: UserRole; token: string }): EmailMessage {
  const url = appLink(ctx, `/invito?token=${encodeURIComponent(input.token)}`)
  return accessEmail(ctx, INVITE_TEMPLATE[input.role], input, url)
}

export function verifyEmailEmail(ctx: EmailContext, input: Recipient & { token: string }): EmailMessage {
  const url = appLink(ctx, `/verifica-email?token=${encodeURIComponent(input.token)}`)
  return accessEmail(ctx, 'auth.verify_email', input, url)
}

export function resetPasswordEmail(ctx: EmailContext, input: Recipient & { token: string }): EmailMessage {
  const url = appLink(ctx, `/reimposta-password?token=${encodeURIComponent(input.token)}`)
  return accessEmail(ctx, 'auth.reset_password', input, url)
}
