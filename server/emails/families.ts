// Emails of the families area. No health details: the age notice speaks of the camp's ages, never of a
// person's condition. Its texts live in shared/utils/automatic-emails.ts.
import { automaticEmail } from './automatic'
import { appLink } from './layout'
import type { EmailContext, EmailMessage } from './types'

/** To a family whose young people with a condition are all outside the camp's ages (docs/spec.md, 3.8). */
export function guestAgeEmail(
  ctx: EmailContext,
  input: { to: string; toUserId: string; firstName: string },
): EmailMessage {
  return automaticEmail(ctx, 'family.age_notice', {
    to: input.to,
    toUserId: input.toUserId,
    values: { nome: input.firstName },
    actionUrl: appLink(ctx, '/famiglia/membri'),
  })
}
