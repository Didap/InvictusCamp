// CSV files for spreadsheets in Italian: semicolons, a BOM so that Excel reads UTF-8, CRLF lines.
// Explicit imports only, so the database tests can load this file.
import { formatDay } from '../../shared/utils/format'

export type CsvValue = string | number | null | undefined

/** A CSV cell: quoted when needed, and never read as a formula by a spreadsheet. */
export function csvCell(value: CsvValue): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** The whole file, header first. */
export function toCsv(rows: CsvValue[][]): string {
  return `﻿${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}\r\n`
}

/** A CSV file about a session, named "<prefix>-<title>-<start day>.csv". */
export function sessionCsv(
  session: { title: string; startDate: string },
  prefix: string,
  rows: CsvValue[][],
): { filename: string; csv: string } {
  const slug = session.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return {
    filename: `${prefix}-${slug || 'sessione'}-${formatDay(session.startDate, 'numeric').replaceAll('/', '-')}.csv`,
    csv: toCsv(rows),
  }
}
