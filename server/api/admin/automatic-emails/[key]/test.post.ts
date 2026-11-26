import { emailTextsDraftSchema } from '#shared/schemas/automatic-emails'
import type { DeliveryReport } from '#shared/types/communications'
import { exampleEmail } from '../../../../domain/automatic-emails'

/** "Invia una prova a me": the email as written now, with example data, to the administrator's address. */
export default defineEventHandler(async (event): Promise<DeliveryReport> => {
  const admin = await requireAdmin(event)
  const key = requireAutomaticEmailKey(event)
  const texts = await parseBody(event, emailTextsDraftSchema)
  return deliver(
    exampleEmail(appEmailContext(), key, { to: admin.email, toUserId: admin.id, firstName: admin.firstName }, texts),
  )
})
