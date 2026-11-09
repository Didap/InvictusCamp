import { removeAvailability } from '../../../domain/staff'

/** Removes one of the person's own periods. */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event, { approved: true })
  await removeAvailability(useDb(), user.id, requireUuidParam(event, 'id'))
  return { ok: true }
})
