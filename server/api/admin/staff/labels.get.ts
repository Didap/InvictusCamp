import { staffLabels } from '../../../domain/staff-labels'

/** The roles of staff and v-team and the tags of the «Valutazione», with how many people have each. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  return staffLabels(useDb())
})
