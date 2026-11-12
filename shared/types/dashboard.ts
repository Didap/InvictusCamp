// GET /api/admin/dashboard: the Panoramica of the administration (docs/spec.md, 3.9).
import type { IsoDay } from '../utils/dates'
import type { SessionStatus } from '../utils/constants'
import type { StaffCounts } from './sessions'

/** A session that has not ended yet, with the progress of its families and staff. */
export interface DashboardSession {
  id: string
  title: string
  startDate: IsoDay
  endDate: IsoDay
  status: SessionStatus
  responseDeadline: IsoDay | null
  places: {
    total: number
    /** Titolari selected, invited or confirmed. */
    held: number
    confirmed: number
    /** Titolari invited, still to answer. */
    awaiting: number
    free: number
    /** Reserves waiting to be called. */
    reserves: number
  }
  staff: StaffCounts
}

/** One thing to do, with the page where it is done. */
export interface DashboardTodo {
  key: string
  label: string
  detail?: string
  to: string
  icon: string
}

export interface DashboardDto {
  today: IsoDay
  nextSession: DashboardSession | null
  /** The three sessions not ended yet (draft, inviting, confirmed) after the next one: a season is on the sessions page. */
  following: DashboardSession[]
  counts: {
    /** Staff applications `applied`. */
    applicationsToReview: number
    /** Families that have not confirmed their data yet. */
    formsToComplete: number
    /** Signature requests pending, documents not archived. */
    signaturesPending: number
    /** Emails not delivered in the last FAILED_EMAIL_DAYS days. */
    emailsFailed: number
  }
  todo: DashboardTodo[]
}

/** The window of the "emails failed" number. */
export const FAILED_EMAIL_DAYS = 30
