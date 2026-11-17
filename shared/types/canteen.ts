import type { CanteenGroups, CanteenSummary } from '../utils/canteen'
import type { DayRange } from '../utils/dates'

/** GET /api/admin/sessions/:id/canteen: the canteen summary of a session (docs/spec.md 3.14). */
export interface CanteenDto extends CanteenSummary, CanteenGroups {
  session: DayRange & { title: string }
}
