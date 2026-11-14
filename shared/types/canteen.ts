import type { CanteenSummary } from '../utils/canteen'

/** GET /api/admin/sessions/:id/canteen: the canteen summary of a session (docs/spec.md 3.14). */
export interface CanteenDto extends CanteenSummary {
  session: { title: string; startDate: string; endDate: string }
  /** Families holding a place, and how many of the staff eat with them. */
  families: number
  staff: number
  /** Families holding a place without cards: their people are not counted yet. */
  withoutCards: string[]
}
