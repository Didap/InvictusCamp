import { staffDetail } from '../../../../domain/staff'

/** One staff member: contacts, application, review, availability, convocations, personal documents. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  return staffDetail(useDb(), requireUuidParam(event, 'userId'))
})
