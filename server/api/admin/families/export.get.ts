import { adminFamilyListQuerySchema } from '#shared/schemas/families'
import { enumLabel } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDateTime } from '#shared/utils/format'
import { familiesForExport } from '../../../domain/families'

/**
 * CSV of the families matching the filters of the list (semicolons and a BOM, so Excel in Italian
 * opens it as it is): contacts and questionnaire status, never health details. The export is audited.
 */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const query = parseQuery(event, adminFamilyListQuerySchema)
  const rows = await familiesForExport(useDb(), query)
  const header = [
    'Famiglia',
    'Nome referente',
    'Cognome referente',
    'Email',
    'Telefono',
    'Indirizzo',
    'CAP',
    'Città',
    'Provincia',
    'Regione',
    'Componenti',
    'Dati della famiglia',
    'Confermati il',
    'Registrata il',
  ]
  const lines = rows.map(row => [
    row.name,
    row.firstName,
    row.lastName,
    row.email,
    row.phone ?? '',
    row.address ?? '',
    row.postalCode ?? '',
    row.city ?? '',
    row.province ?? '',
    row.region ?? '',
    String(row.memberCount),
    enumLabel('familyFormStatus', row.formStatus),
    formatDateTime(row.formSubmittedAt),
    formatDateTime(row.createdAt),
  ])
  await audit(event, {
    actorUserId: admin.id,
    action: 'family.export',
    entityType: 'family',
    data: { count: rows.length },
  })
  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="famiglie-${todayIso()}.csv"`,
    'Cache-Control': 'private, no-store',
  })
  return `﻿${[header, ...lines].map(cells => cells.map(csvCell).join(';')).join('\r\n')}\r\n`
})

/** A CSV cell: quoted when needed, and never read as a formula by a spreadsheet. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[";\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}
