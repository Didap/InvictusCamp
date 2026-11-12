import type { H3Event } from 'h3'

/** Sends a CSV file as a download that no cache keeps. */
export function sendCsv(event: H3Event, file: { filename: string; csv: string }): string {
  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${file.filename}"`,
    'Cache-Control': 'private, no-store',
  })
  return file.csv
}
