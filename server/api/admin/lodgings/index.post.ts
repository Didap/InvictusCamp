import { lodgingSchema } from '#shared/schemas/lodgings'
import { createLodging } from '../../../domain/lodgings'

/** Adds a lodging to the layout. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const input = await parseBody(event, lodgingSchema)
  return { id: await createLodging(useDb(), input) }
})
