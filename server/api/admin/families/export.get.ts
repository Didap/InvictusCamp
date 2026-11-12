import { adminFamilyListQuerySchema } from '#shared/schemas/families'
import { enumLabel } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDateTime } from '#shared/utils/format'
import { toCsv } from '../../../domain/csv'
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
    row.phone,
    row.address,
    row.postalCode,
    row.city,
    row.province,
    row.region,
    row.memberCount,
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
  return sendCsv(event, { filename: `famiglie-${todayIso()}.csv`, csv: toCsv([header, ...lines]) })
})
