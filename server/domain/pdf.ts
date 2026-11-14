// Plain text PDFs: a title, paragraphs that wrap, a footer, on as many A4 pages as they need. The demo
// documents of the seed and the families' releases. Explicit imports only.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE: [number, number] = [595.28, 841.89]
const MARGIN = 56
const WIDTH = 480

export async function textPdf(title: string, paragraphs: string[], footer: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  pdf.setAuthor('Invictus Camp')
  pdf.setCreator('Gestionale Invictus Camp')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  // The standard fonts write WinAnsi only: «Łukasz» becomes «Lukasz», what has no plain form a «?».
  const known = new Set(font.getCharacterSet())
  const safe = (text: string) =>
    [...text]
      .map(char => {
        if (known.has(char.codePointAt(0)!)) return char
        const plain = char.normalize('NFD').replace(/\p{M}/gu, '')
        return [...plain].every(c => known.has(c.codePointAt(0)!)) ? plain : '?'
      })
      .join('')
  let page = pdf.addPage(PAGE)
  const newPage = () => {
    page.drawText(footer, { x: MARGIN, y: 48, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
    page = pdf.addPage(PAGE)
    return 780
  }
  page.drawText('Invictus Camp', { x: MARGIN, y: 780, size: 11, font: bold, color: rgb(0.114, 0.373, 0.69) })
  page.drawText(safe(title), { x: MARGIN, y: 748, size: 17, font: bold, color: rgb(0.12, 0.11, 0.1) })
  let y = 712
  const line = (text: string) => {
    if (y < 80) y = newPage()
    page.drawText(text, { x: MARGIN, y, size: 11, font })
    y -= 16
  }
  /** A word wider than the line, cut into pieces that fit. */
  const pieces = (word: string): string[] => {
    const out: string[] = []
    let piece = ''
    for (const char of word) {
      if (piece && font.widthOfTextAtSize(piece + char, 11) > WIDTH) {
        out.push(piece)
        piece = ''
      }
      piece += char
    }
    return [...out, piece]
  }
  for (const text of paragraphs) {
    let current = ''
    for (const word of safe(text).split(' ').flatMap(pieces)) {
      const next = current ? `${current} ${word}` : word
      if (current && font.widthOfTextAtSize(next, 11) > WIDTH) {
        line(current)
        current = word
      } else current = next
    }
    if (current) line(current)
    y -= 10
  }
  page.drawText(safe(footer), { x: MARGIN, y: 48, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
  return pdf.save()
}
