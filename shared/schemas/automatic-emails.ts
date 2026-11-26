import { z } from 'zod'
import {
  EMAIL_TEXT_LIMITS,
  emailFieldIssue,
  hasEmailAction,
  type AutomaticEmailKey,
  type EmailTexts,
} from '../utils/automatic-emails'
import { zText } from './common'
import { zAudience } from './communications'

const REQUIRED: readonly (keyof EmailTexts)[] = ['subject', 'title', 'body']
const TEXT_KEYS = Object.keys(EMAIL_TEXT_LIMITS) as (keyof EmailTexts)[]

/** The texts as typed: whatever is written renders in the preview. */
export const emailTextsDraftSchema = z.object(
  Object.fromEntries(TEXT_KEYS.map(key => [key, zText(EMAIL_TEXT_LIMITS[key])])) as Record<
    keyof EmailTexts,
    ReturnType<typeof zText>
  >,
)

/**
 * The texts of one email, to save: subject, title and body written, the button's label when the email has a
 * button, and only the fields in braces that email fills.
 */
export function emailTextsSchema(key: AutomaticEmailKey) {
  return emailTextsDraftSchema.superRefine((texts, ctx) => {
    const required = hasEmailAction(key) ? [...REQUIRED, 'actionLabel' as const] : REQUIRED
    for (const field of TEXT_KEYS) {
      const issue =
        required.includes(field) && !texts[field] ? 'Campo obbligatorio' : emailFieldIssue(key, texts[field])
      if (issue) ctx.addIssue({ code: 'custom', path: [field], message: issue })
    }
  })
}

/** PUT /api/admin/automatic-emails/:key: the texts, and when the page read the email (null: never changed). */
export function emailTextsSaveSchema(key: AutomaticEmailKey) {
  return z.object({ texts: emailTextsSchema(key), updatedAt: z.iso.datetime().nullable() })
}

export const emailActiveSchema = z.object({ active: z.boolean() })

/** "Invia a mano": who receives the email now. */
export const manualSendSchema = z.object({ audience: zAudience })
