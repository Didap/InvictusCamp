import type { CanteenGroups, CanteenSession, CanteenSummary } from '../utils/canteen'

/** GET /api/admin/sessions/:id/canteen: the canteen summary of a session (docs/spec.md 3.14). */
export interface CanteenDto extends CanteenSummary, CanteenGroups {
  session: CanteenSession
}
