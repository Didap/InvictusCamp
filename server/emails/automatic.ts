// Renders an automatic email (shared/utils/automatic-emails.ts) with the texts the administration wrote,
// or its defaults: the fields in braces filled for the recipient, the facts and the button's address
// from the platform. Everything written goes through the layout's escaping.
import {
  automaticEmailDefinition,
  fillEmailFields,
  type AutomaticEmailKey,
  type EmailFieldValues,
  type EmailTexts,
  type EmailTextsByKey,
} from '../../shared/utils/automatic-emails'
import { bodyParagraphs, oneLine, renderTextEmail } from './communications'
import type { EmailContext, EmailMessage } from './types'

export interface AutomaticEmailInput {
  to: string
  toUserId?: string | null
  values: EmailFieldValues
  /** Label and value rows the platform fills (dates, place, document, code). */
  details?: { label: string; value: string }[]
  /** Where the button leads; without it the email has no button. */
  actionUrl?: string
  /** Replaces the body for this one email (the outcome the administration wrote when sending it). */
  body?: string
  /** Paragraphs written for this one email (a convocation's message), after the body. */
  extra?: string | null
  sessionId?: string | null
  sensitive?: boolean
  devNote?: string
}

/** The texts the email goes out with: those written in the dashboard, or its defaults. */
export function emailTexts(texts: EmailTextsByKey | undefined, key: AutomaticEmailKey): EmailTexts {
  return texts?.[key] ?? automaticEmailDefinition(key).defaults
}

export function automaticEmail(ctx: EmailContext, key: AutomaticEmailKey, input: AutomaticEmailInput): EmailMessage {
  const texts = emailTexts(ctx.texts, key)
  const fill = (text: string) => fillEmailFields(key, text, input.values)
  const line = (text: string) => oneLine(fill(text))
  const paragraphs = (text: string) => bodyParagraphs(fill(text))
  const actionLabel = line(texts.actionLabel)

  const { html, text } = renderTextEmail(ctx, {
    preheader: line(texts.preheader) || undefined,
    title: line(texts.title),
    greeting: line(texts.greeting) || undefined,
    paragraphs: [...paragraphs(input.body ?? texts.body), ...paragraphs(input.extra ?? '')],
    details: input.details,
    action: input.actionUrl && actionLabel ? { label: actionLabel, url: input.actionUrl } : undefined,
    after: paragraphs(texts.after),
    footnote: line(texts.footnote) || undefined,
  })
  return {
    to: input.to,
    toUserId: input.toUserId ?? null,
    template: key,
    subject: line(texts.subject),
    html,
    text,
    sessionId: input.sessionId ?? null,
    ...(ctx.off?.has(key) ? { switchedOff: true } : {}),
    ...(input.sensitive ? { sensitive: true } : {}),
    ...(input.devNote ? { devNote: input.devNote } : {}),
  }
}
