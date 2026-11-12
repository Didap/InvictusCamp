import type { LodgingFeature, ParticipationStatus } from '../utils/constants'

/** A lodging of the camp (docs/spec.md 3.11). */
export interface Lodging {
  id: string
  name: string
  area: string | null
  beds: number
  features: LodgingFeature[]
  description: string | null
}

/** GET /api/admin/lodgings: with the sessions, not cancelled, that place a family in it. */
export interface LodgingListItem extends Lodging {
  sessions: number
}

/** A family holding a place in the session, with what the Alloggi tab needs to place it. */
export interface SessionLodgingFamily {
  /** The participation (session_families row). */
  id: string
  familyId: string
  familyName: string
  status: ParticipationStatus
  /** The cards in Componenti. */
  people: number
  /** The answer "Esigenze per l'alloggio" of the family data. */
  needs: LodgingFeature[]
  lodgingId: string | null
}

/** GET /api/admin/sessions/:id/lodgings */
export interface SessionLodgingsDto {
  sessionId: string
  /** Assignments change while the session is not completed nor cancelled. */
  editable: boolean
  lodgings: Lodging[]
  families: SessionLodgingFamily[]
}
