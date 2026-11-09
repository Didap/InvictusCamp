// The one layout of every email: cream page, white card, the brand mark, one clear action.
// Table-based and inline-styled so it renders the same in Gmail, Outlook and Apple Mail.
// Copy rules (DESIGN.md, Voice): plain Italian, short sentences, the "tu" form, no em dashes.
import type { EmailContext } from './types'

const C = {
  page: '#fcf9ef',
  card: '#ffffff',
  ink: '#1f1d19',
  muted: '#5c5649',
  border: '#e6e0d1',
  primary: '#1d5fb0',
  soft: '#f6f2e6',
}

const FONT = "'Atkinson Hyperlegible Next', 'Segoe UI', Arial, Helvetica, sans-serif"

export interface EmailContent {
  /** Hidden preview line shown by mail clients next to the subject. */
  preheader?: string
  title: string
  /** "Ciao Anna," */
  greeting?: string
  paragraphs: string[]
  /** Label and value rows (dates, place, document). */
  details?: { label: string; value: string }[]
  action?: { label: string; url: string }
  /** Paragraphs after the button. */
  after?: string[]
  /** Small print under the card (why you received this, what to do if it was not you). */
  footnote?: string
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** An absolute link into the app. */
export function appLink(ctx: EmailContext, path: string): string {
  return new URL(path, ctx.appUrl).toString()
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.ink}">${escapeHtml(text)}</p>`
}

export function renderEmail(ctx: EmailContext, content: EmailContent): { html: string; text: string } {
  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:${C.soft};border-radius:8px">${content.details
        .map(
          row =>
            `<tr><td style="padding:10px 14px;font-family:${FONT};font-size:14px;line-height:1.4;color:${C.muted};width:38%;vertical-align:top">${escapeHtml(row.label)}</td><td style="padding:10px 14px;font-family:${FONT};font-size:15px;line-height:1.4;color:${C.ink};font-weight:600;vertical-align:top">${escapeHtml(row.value)}</td></tr>`,
        )
        .join('')}</table>`
    : ''

  const action = content.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:8px;background:${C.primary}"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(content.action.label)}</a></td></tr></table>
<p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted}">Se il pulsante non funziona, copia questo indirizzo nel browser:<br><a href="${escapeHtml(content.action.url)}" style="color:${C.primary};word-break:break-all">${escapeHtml(content.action.url)}</a></p>`
    : ''

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(content.preheader ?? content.paragraphs[0] ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px">
<img src="${escapeHtml(appLink(ctx, '/brand/logo-mark.png'))}" width="36" height="36" alt="" style="display:inline-block;vertical-align:middle;border:0">
<span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:${FONT};font-size:17px;font-weight:700;color:${C.ink}">Invictus Camp</span>
</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:32px 28px">
<h1 style="margin:0 0 20px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${C.ink}">${escapeHtml(content.title)}</h1>
${content.greeting ? paragraph(content.greeting) : ''}
${content.paragraphs.map(paragraph).join('\n')}
${details}
${action}
${(content.after ?? []).map(paragraph).join('\n')}
</td></tr>
<tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted}">
${content.footnote ? `${escapeHtml(content.footnote)}<br><br>` : ''}Invictus Camp, Maruggio (TA). Ricevi questa email perché hai un account sul gestionale del camp.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = [
    content.title,
    '',
    ...(content.greeting ? [content.greeting, ''] : []),
    ...content.paragraphs.flatMap(p => [p, '']),
    ...(content.details ?? []).map(row => `${row.label}: ${row.value}`),
    ...(content.details?.length ? [''] : []),
    ...(content.action ? [`${content.action.label}: ${content.action.url}`, ''] : []),
    ...(content.after ?? []).flatMap(p => [p, '']),
    ...(content.footnote ? [content.footnote, ''] : []),
    'Invictus Camp, Maruggio (TA)',
  ].join('\n')

  return { html, text }
}
