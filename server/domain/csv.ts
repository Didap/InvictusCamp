// CSV files for spreadsheets in Italian: semicolons, a BOM so that Excel reads UTF-8, CRLF lines.
// Explicit imports only, so the database tests can load this file.
import { formatDay } from '../../shared/utils/format'

type CsvValue = string | number | null | undefined

/** A CSV cell: quoted when needed, and never read as a formula by a spreadsheet. */
function csvCell(value: CsvValue): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** The whole file, header first. */
export function toCsv(rows: CsvValue[][]): string {
  return `﻿${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}\r\n`
}

/** The name of a file about a session: "<prefix>-<title>-<start day>.<extension>". */
export function sessionFileName(
  session: { title: string; startDate: string },
  prefix: string,
  extension: string,
): string {
  const slug = session.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${prefix}-${slug || 'sessione'}-${formatDay(session.startDate, 'numeric').replaceAll('/', '-')}.${extension}`
}

/** A CSV file about a session, named "<prefix>-<title>-<start day>.csv". */
export function sessionCsv(
  session: { title: string; startDate: string },
  prefix: string,
  rows: CsvValue[][],
): { filename: string; csv: string } {
  return { filename: sessionFileName(session, prefix, 'csv'), csv: toCsv(rows) }
}
