import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { blockLines, toWinAnsi } from '~~/server/domain/pdf'
import { buildSignedPdf, formatSignatureTime, type CertificateData } from '~~/server/domain/signatures'
import { signatureSignedEmail } from '~~/server/emails/documents'
import { documentRequestEmail } from '~~/server/emails/signatures'

async function pdfWithPages(count: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < count; i++) pdf.addPage([595.28, 841.89])
  return pdf.save()
}

const certificate: CertificateData = {
  documentTitle: 'Regolamento del camp 2027 ≥ «versione definitiva»',
  signedName: 'Łukasz Șerban Ελένη 😀',
  accountName: 'Anna Rossi',
  email: 'anna@example.com',
  signedAt: new Date('2027-01-10T09:05:00Z'),
  ip: '203.0.113.7',
  userAgent: `Mozilla/5.0 ${'MoltoLungoSenzaSpazi'.repeat(20)}`,
  sha256: 'a'.repeat(64),
  requestId: '6f1c2a54-36a5-4c0a-9a3b-2f9b8e3d1c11',
}

describe('the signed copy', () => {
  it('opens with pdf-lib and has one more page than the original', async () => {
    const signed = await buildSignedPdf(await pdfWithPages(2), certificate)
    const pdf = await PDFDocument.load(signed)
    expect(pdf.getPageCount()).toBe(3)
  })

  it('draws names outside WinAnsi without failing', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    expect(toWinAnsi(font, 'Șerban è d’accordo')).toBe('Serban è d’accordo')
    expect(toWinAnsi(font, 'Ł 😀 ≥')).toBe('? ? ?')
    expect(toWinAnsi(font, 'riga\nnuova')).toBe('riga nuova')
    // Intl puts thin spaces around the dash of a range across two months.
    expect(toWinAnsi(font, '28 giugno\u2009–\u20092 luglio')).toBe('28 giugno – 2 luglio')
  })

  it('starts a new line at a line break in a block, a blank line where there are two', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    expect(blockLines(font, 'Accoglienza, con Nicola\nGiallo: Piscina', 11, 480)).toEqual([
      'Accoglienza, con Nicola',
      'Giallo: Piscina',
    ])
    expect(blockLines(font, 'Care famiglie,\r\n\r\nA presto', 11, 480)).toEqual(['Care famiglie,', '', 'A presto'])
    // Each line still wraps at the width.
    expect(blockLines(font, 'uno due tre\nquattro', 11, 40)).toEqual(['uno due', 'tre', 'quattro'])
  })

  it('writes the time of the signature in Italian time', () => {
    expect(formatSignatureTime(new Date('2027-01-10T09:05:00Z'))).toBe('10 gennaio 2027, 10:05:00 (ora italiana)')
    expect(formatSignatureTime(new Date('2027-07-10T09:05:00Z'))).toBe('10 luglio 2027, 11:05:00 (ora italiana)')
  })
})

describe('emails of the documents area', () => {
  const ctx = { appUrl: 'https://gestionale.invictuscamp.it' }

  it('link the signing page and keep the confirmation in the log', () => {
    const message = signatureSignedEmail(ctx, {
      to: 'anna@example.com',
      toUserId: 'u1',
      firstName: 'Anna',
      documentTitle: 'Regolamento',
      requestId: 'r1',
      signedAt: new Date('2027-01-10T09:05:00Z'),
    })
    expect(message).toMatchObject({ template: 'signature.signed', subject: 'Hai firmato «Regolamento»' })
    expect(message.sensitive).toBeFalsy()
    expect(message.html).toContain('https://gestionale.invictuscamp.it/firma/r1')
  })

  it('ask to read, not to sign, a document to read', () => {
    const message = documentRequestEmail(ctx, {
      requiresSignature: false,
      to: 'anna@example.com',
      toUserId: 'u1',
      firstName: 'Anna',
      documentTitle: 'Guida al camp',
      requestId: 'r2',
      reminder: true,
    })
    expect(message.template).toBe('document.read_reminder')
    expect(message.subject).toBe('Promemoria: documento da leggere, «Guida al camp»')
    expect(message.text).not.toContain('codice')
  })
})
