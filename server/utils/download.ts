import type { H3Event } from 'h3'
import { cleanName } from '../domain/storage'

/** The headers of a file sent to the browser, inline (preview) or as a download. Never kept by shared caches. */
export function setFileHeaders(
  event: H3Event,
  file: { filename: string; type: string; length: number; download?: boolean },
): void {
  const name = cleanName(file.filename)
  const ascii = name.replace(/[^\x20-\x7e]/g, '_')
  setResponseHeaders(event, {
    'Content-Type': file.type,
    'Content-Length': String(file.length),
    'Content-Disposition': `${file.download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'private, no-store',
  })
}

export function sendCsv(event: H3Event, file: { filename: string; csv: string }): string {
  const type = 'text/csv; charset=utf-8'
  setFileHeaders(event, { filename: file.filename, type, length: Buffer.byteLength(file.csv), download: true })
  return file.csv
}

export function sendPdf(event: H3Event, file: { filename: string; data: Uint8Array }): Uint8Array {
  const type = 'application/pdf'
  setFileHeaders(event, { filename: file.filename, type, length: file.data.byteLength, download: true })
  return file.data
}
