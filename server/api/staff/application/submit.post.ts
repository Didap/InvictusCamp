import { staffApplicationSchema } from '#shared/schemas/staff'
import { myApplication, submitApplication } from '../../../domain/staff'

/** Sends the application (registered → applied). The administration reviews it; nothing is emailed. */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const input = await parseBody(event, staffApplicationSchema)
  await useDb().transaction(tx => submitApplication(tx, user.id, input, { ip: clientIp(event) }))
  return myApplication(useDb(), user.id)
})
