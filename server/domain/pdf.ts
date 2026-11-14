// Plain text PDFs: a title, paragraphs that wrap, a footer, on as many A4 pages as they need. The demo
// documents of the seed and the families' releases; the WinAnsi and wrapping helpers serve the signed copies
// too (signatures.ts). Explicit imports only.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'

const PAGE: [number, number] = [595.28, 841.89]
const MARGIN = 56
const WIDTH = 480
const TOP = 780
const SIZE = 11

/**
 * Text the standard fonts can draw (WinAnsi): accented letters outside it lose the accent ("ł" stays
 * "?", "ș" becomes "s"), control characters become spaces, anything else becomes "?".
 */
export function toWinAnsi(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet())
  let out = ''
  for (const char of text.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ')) {
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

export async function textPdf(title: string, paragraphs: string[], footer: string): Promise<Uint8Array> {
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
  for (const text of paragraphs) {
    for (const line of wrap(font, toWinAnsi(font, text), SIZE, WIDTH)) {
      if (y < 80) {
        drawFooter()
        page = pdf.addPage(PAGE)
        y = TOP
      }
      page.drawText(line, { x: MARGIN, y, size: SIZE, font })
      y -= 16
    }
    y -= 10
  }
  drawFooter()
  return pdf.save()
}
