import { deleteLodging } from '../../../domain/lodgings'

/** Deletes a lodging; the families placed in it, in any session, are left without one. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  await deleteLodging(useDb(), requireUuidParam(event, 'id'))
  return { ok: true }
})
