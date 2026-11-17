// Plain text PDFs: a title, paragraphs and headings that wrap, a footer, on as many A4 pages as they need. The
// demo documents of the seed, the families' releases and the canteen sheet for the supplier; the WinAnsi and
// wrapping helpers serve the signed copies too (signatures.ts). Explicit imports only.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { todayIso, type DayRange } from '../../shared/utils/dates'
import { formatDay, formatDayRange } from '../../shared/utils/format'
import { sessionFileName } from './csv'

const PAGE: [number, number] = [595.28, 841.89]
const MARGIN = 56
const WIDTH = 480
const TOP = 780
const SIZE = 11

/**
 * Text the standard fonts can draw (WinAnsi): accented letters outside it lose the accent ("ł" stays
 * "?", "ș" becomes "s"), control characters and every kind of space become spaces (Intl puts thin spaces
 * around the dash of "28 giugno – 2 luglio"), anything else becomes "?".
 */
export function toWinAnsi(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet())
  let out = ''
  for (const char of text.normalize('NFC').replace(/[\u0000-\u001f\u007f\p{Zs}]/gu, ' ')) {
    if (supported.has(char.codePointAt(0)!)) {
      out += char
      continue
    }
    const base = char.normalize('NFD').replace(/\p{M}/gu, '')
    out += base && [...base].every(c => supported.has(c.codePointAt(0)!)) ? base : '?'
  }
  return out
}

/** Lines of at most `width` points; words longer than a line are cut. */
export function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let piece = word
    while (font.widthOfTextAtSize(piece, size) > width) {
      let cut = piece.length - 1
      while (cut > 1 && font.widthOfTextAtSize(piece.slice(0, cut), size) > width) cut--
      if (line) lines.push(line)
      lines.push(piece.slice(0, cut))
      line = ''
      piece = piece.slice(cut)
    }
    const next = line ? `${line} ${piece}` : piece
    if (font.widthOfTextAtSize(next, size) > width) {
      lines.push(line)
      line = piece
    } else line = next
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

/** A paragraph; a heading (13 pt, bold, space above); a bold label that stays with the paragraph after it. */
export type PdfBlock = string | { heading: string } | { label: string }

// `room`: the lowest line a block starts on. A heading keeps a label and a line under it on its page, a
// label a line: neither ends a page.
const STYLES = {
  paragraph: { size: SIZE, before: 0, after: 10, room: 80 },
  heading: { size: 13, before: 8, after: 4, room: 130 },
  label: { size: SIZE, before: 0, after: 0, room: 100 },
}

function blockOf(block: PdfBlock): [keyof typeof STYLES, string] {
  if (typeof block === 'string') return ['paragraph', block]
  return 'heading' in block ? ['heading', block.heading] : ['label', block.label]
}

export async function textPdf(title: string, blocks: PdfBlock[], footer: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  pdf.setAuthor('Invictus Camp')
  pdf.setCreator('Gestionale Invictus Camp')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage(PAGE)
  const drawFooter = () =>
    page.drawText(toWinAnsi(font, footer), { x: MARGIN, y: 48, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
  page.drawText('Invictus Camp', { x: MARGIN, y: TOP, size: SIZE, font: bold, color: rgb(0.114, 0.373, 0.69) })
  page.drawText(toWinAnsi(bold, title), { x: MARGIN, y: 748, size: 17, font: bold, color: rgb(0.12, 0.11, 0.1) })
  let y = 712
  for (const block of blocks) {
    const [kind, text] = blockOf(block)
    const style = STYLES[kind]
    const face = kind === 'paragraph' ? font : bold
    y -= style.before
    for (const line of wrap(face, toWinAnsi(face, text), style.size, WIDTH)) {
      if (y < style.room) {
        drawFooter()
        page = pdf.addPage(PAGE)
        y = TOP
      }
      page.drawText(line, { x: MARGIN, y, size: style.size, font: face })
      y -= style.size + 5
    }
    y -= style.after
  }
  drawFooter()
  return pdf.save()
}

/**
 * A PDF about a session, the twin of sessionCsv: its title and dates first, then the blocks; at the foot
 * what the reader should know and the day it was made.
 */
export async function sessionPdf(
  session: DayRange & { title: string },
  file: { prefix: string; title: string; blocks: PdfBlock[]; notice: string },
): Promise<{ filename: string; data: Uint8Array }> {
  return {
    filename: sessionFileName(session, file.prefix, 'pdf'),
    data: await textPdf(
      file.title,
      [`${session.title}, ${formatDayRange(session.startDate, session.endDate, 'long')}.`, ...file.blocks],
      `${file.notice} Aggiornato al ${formatDay(todayIso(), 'numeric')}.`,
    ),
  }
}
