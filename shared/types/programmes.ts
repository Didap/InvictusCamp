import type { SessionStatus } from '../utils/constants'
import type { ProgrammeContent } from './domain'

/** A programme as the editor loads it. */
export interface ProgrammeDto {
  id: string
  year: number | null
  sessionId: string | null
  content: ProgrammeContent
  revision: number
  updatedAt: string
  updatedByName: string | null
}

/** A year in /admin/programma: one with a programme, or one with sessions still waiting for it. */
export interface ProgrammeYearItem {
  year: number
  exists: boolean
  updatedAt: string | null
  /** Sessions of the year (not cancelled). */
  sessions: number
  /** Of those, the ones with a copy of their own. */
  copies: number
}

/** The programme tab of a session (administration). */
export interface SessionProgrammeDto {
  /** The year whose programme the session uses unless it has a copy. */
  year: number
  /** Every day of the session, first to last. */
  dates: string[]
  editable: boolean
  source: 'session' | 'year' | 'none'
  programme: ProgrammeDto | null
}

/** The programme a family or a staff member of the session reads. */
export interface ProgrammeView {
  session: { id: string; title: string; startDate: string; endDate: string; status: SessionStatus }
  dates: string[]
  /** Null while there is no programme for the session yet. */
  content: ProgrammeContent | null
}
