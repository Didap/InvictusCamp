import type { LodgingListItem } from '#shared/types/lodgings'
import { listLodgings } from '../../../domain/lodgings'

/** The lodgings of the camp, in the order of the layout. */
export default defineEventHandler(async (event): Promise<LodgingListItem[]> => {
  await requireAdmin(event)
  return listLodgings(useDb())
})
