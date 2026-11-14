import type { ConvocationStatus, LodgingFeature, ParticipationStatus, StaffTeam } from '../utils/constants'

/** A lodging of the camp (docs/spec.md 3.11). */
export interface Lodging {
  id: string
  name: string
  area: string | null
  beds: number
  features: LodgingFeature[]
  description: string | null
}

/** GET /api/admin/lodgings: with the sessions that place a family or the staff in it. */
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

/** A person of the session staff or v-team (an open convocation), with the lodging they sleep in. */
export interface SessionLodgingStaff {
  /** The convocation (session_staff row). */
  id: string
  name: string
  team: StaffTeam
  status: ConvocationStatus
  lodgingId: string | null
}

/** GET /api/admin/sessions/:id/lodgings */
export interface SessionLodgingsDto {
  /** Assignments change while the session is not completed nor cancelled. */
  editable: boolean
  lodgings: Lodging[]
  families: SessionLodgingFamily[]
  staff: SessionLodgingStaff[]
}
