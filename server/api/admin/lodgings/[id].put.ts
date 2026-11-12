import { lodgingSchema } from '#shared/schemas/lodgings'
import { updateLodging } from '../../../domain/lodgings'

/** Saves the changes of a lodging; the families placed in it stay there. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const input = await parseBody(event, lodgingSchema)
  await updateLodging(useDb(), id, input)
  return { id }
})
