import type { H3Event } from 'h3'

/** A file made on the fly, sent as a download that no cache keeps. */
function download(event: H3Event, filename: string, type: string): void {
  setResponseHeaders(event, {
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
  })
}

export function sendCsv(event: H3Event, file: { filename: string; csv: string }): string {
  download(event, file.filename, 'text/csv; charset=utf-8')
  return file.csv
}

export function sendPdf(event: H3Event, file: { filename: string; data: Uint8Array }): Buffer {
  download(event, file.filename, 'application/pdf')
  // A view on the same bytes, not a copy.
  return Buffer.from(file.data.buffer, file.data.byteOffset, file.data.byteLength)
}
