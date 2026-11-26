// Renders an automatic email (shared/utils/automatic-emails.ts) with the texts the administration wrote,
// or its defaults: the fields in braces filled for the recipient, the facts and the button's address
// from the platform. Everything written goes through the layout's escaping.
import {
  automaticEmailDefinition,
  fillEmailFields,
  type AutomaticEmailKey,
  type EmailFieldValues,
  type EmailTexts,
} from '../../shared/utils/automatic-emails'
import { bodyParagraphs, LINE_BREAK } from './communications'
import { renderEmail } from './layout'
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

/** The texts the email goes out with now. */
export function emailTexts(ctx: EmailContext, key: AutomaticEmailKey): EmailTexts {
  return ctx.texts?.[key] ?? automaticEmailDefinition(key).defaults
}

export function automaticEmail(ctx: EmailContext, key: AutomaticEmailKey, input: AutomaticEmailInput): EmailMessage {
  const texts = emailTexts(ctx, key)
  const fill = (text: string) => fillEmailFields(key, text, input.values)
  const oneLine = (text: string) => fill(text).replace(/\s+/g, ' ').trim()
  const paragraphs = (text: string) => bodyParagraphs(fill(text))
  const actionLabel = oneLine(texts.actionLabel)

  const rendered = renderEmail(ctx, {
    preheader: oneLine(texts.preheader) || undefined,
    title: oneLine(texts.title),
    greeting: oneLine(texts.greeting) || undefined,
    paragraphs: [...paragraphs(input.body ?? texts.body), ...paragraphs(input.extra ?? '')],
    details: input.details,
    action: input.actionUrl && actionLabel ? { label: actionLabel, url: input.actionUrl } : undefined,
    after: paragraphs(texts.after),
    footnote: oneLine(texts.footnote) || undefined,
  })
  return {
    to: input.to,
    toUserId: input.toUserId ?? null,
    template: key,
    subject: oneLine(texts.subject),
    html: rendered.html.replaceAll(LINE_BREAK, '<br>'),
    text: rendered.text.replaceAll(LINE_BREAK, '\n'),
    sessionId: input.sessionId ?? null,
    ...(ctx.off?.has(key) ? { switchedOff: true } : {}),
    ...(input.sensitive ? { sensitive: true } : {}),
    ...(input.devNote ? { devNote: input.devNote } : {}),
  }
}
