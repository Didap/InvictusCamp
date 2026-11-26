import { contactFilterSchema } from '#shared/schemas/contacts'
import { enumLabel } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { toCsv } from '../../../domain/csv'
import { contactsForExport } from '../../../domain/contacts'

/**
 * CSV of the contacts the filters of the list find (semicolons and a BOM, so Excel in Italian opens it as
 * it is), e.g. to load a group into a mailing list. The export is audited.
 */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const filter = parseQuery(event, contactFilterSchema)
  const rows = await contactsForExport(useDb(), filter)
  const header = ['Nome', 'Cognome', 'Email', 'Tipo', 'Gruppi']
  const lines = rows.map(row => [
    row.firstName,
    row.lastName,
    row.email,
    enumLabel('contactKind', row.kind),
    row.groups,
  ])
  await audit(event, {
    actorUserId: admin.id,
    action: 'contact.export',
    entityType: 'contact',
    data: { count: rows.length },
  })
  return sendCsv(event, { filename: `anagrafica-${todayIso()}.csv`, csv: toCsv([header, ...lines]) })
})
