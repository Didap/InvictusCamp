// DTOs of the families area (A3). Health details (MemberHealth) travel only in the family's own
// endpoints and in the reserved endpoint of the administration, never in lists.
import type { FileDto, Paginated } from './api'
import type { DisabilityInfo, FormAnswers, UsefulInfo } from './domain'
import type { FamilyComposition } from '../schemas/families'
import type {
  FamilyFormStatus,
  GuestAgeStatus,
  ItalianRegion,
  MemberKind,
  MemberRelationship,
  ParticipationKind,
  ParticipationStatus,
  PersonalDocumentCategory,
  SessionStatus,
  UserStatus,
} from '../utils/constants'

/** A session the family takes part in, as the family home and the admin list show it. */
export interface FamilySessionRef {
  id: string
  title: string
  startDate: string
  endDate: string
  location: string
  sessionStatus: SessionStatus
  kind: ParticipationKind
  status: ParticipationStatus
}

/** A row of GET /api/admin/families. Never carries health details. */
export interface FamilyListItem {
  id: string
  name: string
  city: string | null
  province: string | null
  region: ItalianRegion | null
  memberCount: number
  /**
   * Ages of the members with a condition (null: no birth date), unsorted (formatAges orders them). Health
   * data: set only with the family's consent (withdrawing it clears the condition), shown to the
   * administration only.
   */
  fragileAges: (number | null)[]
  formStatus: FamilyFormStatus
  formSubmittedAt: string | null
  referent: { userId: string; firstName: string; lastName: string; email: string; status: UserStatus }
  /** The latest session the family is in (selected, invited or confirmed). */
  lastSession: FamilySessionRef | null
  createdAt: string
}

/** GET /api/admin/families */
export interface FamilyListResponse extends Paginated<FamilyListItem> {
  /** Every province with at least one family, for the filter. */
  provinces: string[]
  /** Every region with at least one family, for the filter. */
  regions: ItalianRegion[]
}

/**
 * A member without health details. Name and relationship are null on a card the family has not filled
 * in yet (created when it confirmed its data): `memberName` (shared/utils/format.ts) names it anyway.
 */
export interface FamilyMemberDto {
  id: string
  firstName: string | null
  lastName: string | null
  birthDate: string | null
  relationship: MemberRelationship | null
  kind: MemberKind
  isReferent: boolean
}

/** Health details of a member: special category data (GDPR art. 9), only after the consent. */
export interface MemberHealth {
  hasDisability: boolean
  disability: DisabilityInfo | null
  /** Allergies, diet and notes: for every member. */
  info: UsefulInfo | null
}

/** A member as the family itself sees it: health is null while the consent is not given. */
export interface OwnFamilyMember extends FamilyMemberDto {
  health: MemberHealth | null
}

/** A member in the family's list: whether the card is still to complete, and whether its ID is uploaded. */
export interface FamilyMemberCard extends OwnFamilyMember {
  toComplete: boolean
  hasIdDocument: boolean
}

/** GET /api/family/members */
export interface FamilyMembersResponse {
  /** Until the family data is confirmed the cards do not exist yet: only the account holder's. */
  formStatus: FamilyFormStatus
  healthDataConsentAt: string | null
  /** Certificates and diagnoses uploaded: withdrawing the consent deletes them. */
  healthDocuments: number
  members: FamilyMemberCard[]
}

/** PUT /api/family/members/consent */
export interface HealthConsentResult {
  healthDataConsentAt: string | null
  /** Members whose health details were deleted because the consent was withdrawn. */
  cleared: number
  /** Certificates and diagnoses deleted with them. */
  documentsRemoved: number
}

/** A document uploaded by the family (certificates, diagnoses, ID, health card). */
export interface PersonalDocumentDto {
  id: string
  category: PersonalDocumentCategory
  title: string
  member: { id: string; firstName: string; lastName: string } | null
  file: FileDto
  createdAt: string
}

/** GET /api/family/profile: the family data, with the answers to its questions. */
export interface FamilyProfileDto {
  id: string
  name: string
  address: string | null
  city: string | null
  postalCode: string | null
  province: string | null
  region: ItalianRegion | null
  phone: string | null
  formAnswers: FormAnswers
  formStatus: FamilyFormStatus
  formSubmittedAt: string | null
  /** The cards the family has, by kind. */
  cards: FamilyComposition
  /** The cards filled in: the composition never goes below them (an empty card goes with the «-»). */
  filledCards: FamilyComposition
  healthDataConsentAt: string | null
}

/** PUT /api/family/profile */
export interface FamilyDataResult {
  profile: FamilyProfileDto
  /** Cards created by this save, one per person declared beyond those already there. */
  cardsCreated: number
  /** Empty cards removed by this save, beyond the people declared. */
  cardsRemoved: number
}

/** GET /api/family/home: the greeting, what is left to do, the next session. */
export interface FamilyHomeDto {
  firstName: string
  familyName: string
  formStatus: FamilyFormStatus
  memberCount: number
  /** Cards created from the family data and not filled in yet. */
  cardsToComplete: number
  healthConsent: boolean
  /** Documents waiting for the family's signature. */
  pendingSignatures: number
  /** The next session with a confirmed place. */
  nextSession: FamilySessionRef | null
  /** A completed session whose questionnaire the family has not answered yet (docs/spec.md 3.13). */
  openFeedback: { sessionId: string; title: string } | null
  /** `out`: no young person with a condition is 5 to 21 years old today (GUEST_AGE). */
  guestAge: GuestAgeStatus
}

/** GET /api/admin/families/:id: the record, without health details (those are in /health). */
export interface AdminFamilyDetail {
  id: string
  name: string
  address: string | null
  city: string | null
  postalCode: string | null
  province: string | null
  region: ItalianRegion | null
  phone: string | null
  formAnswers: FormAnswers
  formStatus: FamilyFormStatus
  formSubmittedAt: string | null
  privacyConsentAt: string | null
  healthDataConsentAt: string | null
  /** Internal notes of the administration; never sent to the family. */
  adminNotes: string | null
  createdAt: string
  referent: {
    userId: string
    firstName: string
    lastName: string
    email: string
    phone: string | null
    status: UserStatus
    emailVerifiedAt: string | null
    lastLoginAt: string | null
  }
  members: FamilyMemberDto[]
  documents: PersonalDocumentDto[]
  /** Sessions where the family already holds a participation (selected, invited or confirmed). */
  activeSessionIds: string[]
}

/** GET /api/admin/families/:id/health: the reserved section of the admin record. */
export interface AdminFamilyHealth {
  healthDataConsentAt: string | null
  members: (Pick<FamilyMemberDto, 'id' | 'firstName' | 'lastName' | 'kind'> & MemberHealth)[]
}
