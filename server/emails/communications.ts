// The message written in the dashboard (template `communication`). Plain text from the composer:
// blank lines separate paragraphs, a single line break stays a line break. Not sensitive: the log
// keeps its content.
import { renderEmail } from './layout'
import type { EmailContext, EmailMessage } from './types'

/** Stands for a line break inside a paragraph while the layout escapes the text. */
const LINE_BREAK = '\u2028'

/** Paragraphs of a plain text body; lines inside a paragraph are joined by LINE_BREAK. */
export function bodyParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .split(/\n[ \t]*\n/)
    .map(paragraph =>
      paragraph
        .split('\n')
        .map(line => line.trimEnd())
        .join(LINE_BREAK)
        .trim(),
    )
    .filter(Boolean)
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
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
  const rendered = renderEmail(ctx, {
    preheader: preview.length > 140 ? `${preview.slice(0, 139)}…` : preview,
    title: subject,
    paragraphs,
    footnote: 'Messaggio dell’amministrazione di Invictus Camp.',
  })
  return {
    to: input.to,
    toUserId: input.toUserId ?? null,
    template: 'communication',
    subject,
    html: rendered.html.replaceAll(LINE_BREAK, '<br>'),
    text: rendered.text.replaceAll(LINE_BREAK, '\n'),
    communicationId: input.communicationId ?? null,
    sessionId: input.sessionId ?? null,
  }
}
