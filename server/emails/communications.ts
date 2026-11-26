// The message written in the dashboard (template `communication`). Plain text from the composer:
// blank lines separate paragraphs, a single line break stays a line break. Not sensitive: the log
// keeps its content.
import { textParagraphs } from '../../shared/utils/plain-text'
import { renderEmail, type EmailContent } from './layout'
import type { EmailContext, EmailMessage } from './types'

/** Stands for a line break inside a paragraph while the layout escapes the text. */
const LINE_BREAK = '\u2028'

/** Paragraphs of a plain text body; lines inside a paragraph are joined by LINE_BREAK. */
export function bodyParagraphs(body: string): string[] {
  return textParagraphs(body, LINE_BREAK)
}

export function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** renderEmail for paragraphs from bodyParagraphs(): their line breaks become <br> and new lines again. */
export function renderTextEmail(ctx: EmailContext, content: EmailContent): { html: string; text: string } {
  const rendered = renderEmail(ctx, content)
  return { html: rendered.html.replaceAll(LINE_BREAK, '<br>'), text: rendered.text.replaceAll(LINE_BREAK, '\n') }
}

export interface CommunicationEmailInput {
  to: string
  toUserId?: string | null
  subject: string
  body: string
  communicationId?: string | null
  sessionId?: string | null
}

export function communicationEmail(ctx: EmailContext, input: CommunicationEmailInput): EmailMessage {
  const subject = oneLine(input.subject)
  const paragraphs = bodyParagraphs(input.body)
  const preview = oneLine((paragraphs[0] ?? '').replaceAll(LINE_BREAK, ' '))
  const rendered = renderTextEmail(ctx, {
    preheader: preview.length > 140 ? `${preview.slice(0, 139)}…` : preview,
    title: subject,
    paragraphs,
    footnote: 'Messaggio di Invictus Camp.',
  })
  return {
    to: input.to,
    toUserId: input.toUserId ?? null,
    template: 'communication',
    subject,
    html: rendered.html,
    text: rendered.text,
    communicationId: input.communicationId ?? null,
    sessionId: input.sessionId ?? null,
  }
}
