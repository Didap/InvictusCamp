import type { ConvocationStatus, ParticipationStatus, ProgrammeGroup, StaffRole } from '../utils/constants'

/** A person of a family, as the groups list it: the first name, the age only for the young. */
export interface GroupMember {
  name: string | null
  /** Years at the start of the session; null for adults and for cards without a birth date. */
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
