import type { ConvocationStatus, ParticipationStatus, ProgrammeGroup, StaffRole } from '../utils/constants'

/** A person of a family, as the groups list it: the first name ("Adulto 2" for a card still to fill in). */
export interface GroupMember {
  name: string
  /** Years at the start of the session, only for the young with a birth date. */
  age: number | null
}

/** A family holding a place in the session, with its activity group (docs/spec.md 3.12). */
export interface SessionGroupFamily {
  /** The participation (session_families row). */
  id: string
  familyId: string
  familyName: string
  status: ParticipationStatus
  group: ProgrammeGroup | null
  /** The cards in Componenti, the young first. */
  members: GroupMember[]
}

/** A person of the session staff who can lead a group: a convocation not declined nor withdrawn. */
export interface SessionGroupStaff {
  /** The convocation (session_staff row). */
  id: string
  name: string
  role: StaffRole | null
  status: ConvocationStatus
  /** The group this person leads. */
  group: ProgrammeGroup | null
}

/** GET /api/admin/sessions/:id/groups */
export interface SessionGroupsDto {
  /** Groups change while the session is not completed nor cancelled. */
  editable: boolean
  families: SessionGroupFamily[]
  staff: SessionGroupStaff[]
}
