import type { UsefulInfo } from './domain'
// DTOs of the staff area (applications, review, availability, convocations). Dates are ISO days,
// instants ISO strings. Never a raw `users` row.
import type { FileDto } from './api'
import type {
  ConvocationStatus,
  ItalianRegion,
  PersonalDocumentCategory,
  SessionStatus,
  ShirtSize,
  SignatureStatus,
  StaffRole,
  StaffStatus,
  StaffTagColor,
  StaffTeam,
  UserStatus,
} from '../utils/constants'
import type { IsoDay } from '../utils/dates'

/** The outcome emails of a review, sent only by an explicit action of the administration. */
export type StaffOutcomeTemplate = 'staff.approved' | 'staff.rejected'

/**
 * The health data of a staff member, under the consent: the details for the canteen and the other ones. In
 * GET /api/staff/sheet for the person, GET /api/admin/staff/:userId/health for the administration (audited).
 */
export interface StaffUsefulInfoDto {
  info: UsefulInfo | null
  otherInfo: string | null
  consentAt: string | null
}

/** The personal sheet as stored (/staff/scheda): null where it is not filled in. */
export interface StaffSheet {
  birthDate: IsoDay | null
  birthPlace: string | null
  fiscalCode: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  province: string | null
  region: ItalianRegion | null
  shirtSize: ShirtSize | null
}

/**
 * The contract that follows an accepted convocation: `none` when the session has no contract,
 * `missing` when it has one but the person has no open request, `pending` to sign, `signed`.
 */
export type ContractState = 'none' | 'missing' | 'pending' | 'signed'

/** A session someone gave (or can give) availability for: the whole session, never part of it. */
export interface AvailabilitySession {
  id: string
  title: string
  startDate: IsoDay
  endDate: IsoDay
}

/** A personal document of a staff account (titles, certificates, ID). */
export interface StaffDocumentDto {
  id: string
  title: string
  category: PersonalDocumentCategory
  file: FileDto
  createdAt: string
}

// ─── Administration ────────────────────────────────────────────────────────────────────────────────

/** A role of staff and v-team (docs/spec.md 3.4), with how many people and convocations have it. */
export interface StaffRoleDto {
  id: StaffRole
  name: string
  people: number
  convocations: number
}

/** A tag of the «Valutazione», with how many people have it. */
export interface StaffTagDto {
  id: string
  name: string
  color: StaffTagColor
  people: number
}

/** GET /api/admin/staff/labels: the roles and the tags the administration created, in their order. */
export interface StaffLabels {
  roles: StaffRoleDto[]
  tags: StaffTagDto[]
}

/** GET /api/admin/staff: one row per staff account. */
export interface StaffListItem {
  userId: string
  firstName: string
  lastName: string
  email: string
  accountStatus: UserStatus
  status: StaffStatus
  team: StaffTeam
  roles: StaffRole[]
  /** Ids of the tags of the «Valutazione». */
  tags: string[]
  city: string | null
  birthDate: IsoDay | null
  appliedAt: string | null
  /** Sessions not started yet the person said they can come to. */
  availableSessions: number
  /** Whether they can come to the session asked for (GET /api/admin/staff?sessionId=), else null. */
  available: boolean | null
}

/** A convocation seen from the page of the person. */
export interface StaffConvocationSummary {
  id: string
  sessionId: string
  sessionTitle: string
  sessionStatus: SessionStatus
  startDate: IsoDay
  endDate: IsoDay
  roleName: string | null
  status: ConvocationStatus
  sentAt: string | null
  respondedAt: string | null
  declineReason: string | null
  contract: ContractState
  /** Accepted and, if the session has a contract, signed. */
  confirmed: boolean
}

/** The outcome email of the review: the one the status calls for, its proposed text, when it last left. */
export interface StaffOutcome {
  template: StaffOutcomeTemplate | null
  subject: string
  defaultMessage: string
  sentAt: string | null
  /** The last outcome email is still waiting in the daily queue. */
  queued: boolean
}

/** GET /api/admin/staff/:userId */
export interface StaffDetail {
  userId: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  accountStatus: UserStatus
  createdAt: string
  status: StaffStatus
  team: StaffTeam
  sheet: StaffSheet
  /** When the person consented to health data: the reserved section opens only then. */
  healthConsentAt: string | null
  roles: StaffRole[]
  /** Ids of the tags of the «Valutazione»: never shown to the person. */
  tags: string[]
  qualifications: string | null
  experience: string | null
  motivation: string | null
  cv: FileDto | null
  appliedAt: string | null
  reviewedAt: string | null
  reviewedByName: string | null
  /** Internal notes of the review: never shown to the person. */
  reviewNotes: string | null
  /** Sessions the person said they can come to, by date. */
  availability: AvailabilitySession[]
  convocations: StaffConvocationSummary[]
  documents: StaffDocumentDto[]
  outcome: StaffOutcome
}

/** The session as the Staff tab needs it. */
export interface SessionStaffSession {
  id: string
  title: string
  startDate: IsoDay
  endDate: IsoDay
  status: SessionStatus
  staffNeeded: number
  /** Convocations can be added, sent and cancelled (the session is not concluded or cancelled). */
  editable: boolean
  contract: { id: string; title: string } | null
}

/** A convocation in the Staff tab of a session. */
export interface SessionConvocation {
  id: string
  userId: string
  firstName: string
  lastName: string
  email: string
  team: StaffTeam
  /** Roles of the person's application. */
  staffRoles: StaffRole[]
  /** Role in this session. */
  role: StaffRole | null
  status: ConvocationStatus
  message: string | null
  sentAt: string | null
  respondedAt: string | null
  declineReason: string | null
  /** The person said they can come to this session (they may have withdrawn it after being added). */
  available: boolean
  contract: ContractState
  confirmed: boolean
  /**
   * The next email reaches the person: a draft can be sent (profile still approved, account not
   * disabled); a sent or accepted one, if cancelled, is told so (account not disabled).
   */
  sendable: boolean
}

/** An approved staff or v-team member, available for the session, who can be added to it. */
export interface AvailableStaff {
  userId: string
  firstName: string
  lastName: string
  team: StaffTeam
  roles: StaffRole[]
  tags: string[]
  city: string | null
  birthDate: IsoDay | null
  /** A previous convocation to this session that was declined or cancelled. */
  previousStatus: Extract<ConvocationStatus, 'declined' | 'cancelled'> | null
}

/** GET /api/admin/convocations?sessionId= */
export interface SessionStaffData {
  session: SessionStaffSession
  convocations: SessionConvocation[]
  available: AvailableStaff[]
}

// ─── Staff side ────────────────────────────────────────────────────────────────────────────────────

/** GET /api/staff/sheet: the personal sheet, with the account's details, the health data and the application. */
export interface StaffSheetDto extends StaffSheetSaved {
  account: { firstName: string; lastName: string; email: string; phone: string | null }
  health: StaffUsefulInfoDto
  application: StaffApplicationDto
}

/** PUT /api/staff/sheet: the sheet as saved and the signature of its PDF, perhaps a new one to sign. */
export interface StaffSheetSaved {
  sheet: StaffSheet
  signature: StaffSheetSignature | null
}

/**
 * The PDF of the sheet in force (server/domain/staff-sheets.ts) and its signature: null while there is none (the
 * sheet incomplete, or complete but never saved since, or archived). Signed on /firma/:requestId, the signed copy
 * at /api/signatures/:requestId/copy.
 */
export interface StaffSheetSignature {
  requestId: string
  status: SignatureStatus
  signedAt: string | null
}

/** The application as it was sent, read only. */
export interface StaffApplicationDto {
  team: StaffTeam
  /** The person's roles, with the names the administration gave them. */
  roles: { id: StaffRole; name: string }[]
  qualifications: string | null
  experience: string | null
  motivation: string | null
  cv: FileDto | null
  appliedAt: string | null
}

/** A convocation of the signed-in staff member (drafts are never shown). */
export interface MyConvocation {
  id: string
  session: {
    id: string
    title: string
    description: string | null
    location: string
    startDate: IsoDay
    endDate: IsoDay
    status: SessionStatus
  }
  roleName: string | null
  status: ConvocationStatus
  message: string | null
  sentAt: string | null
  respondedAt: string | null
  declineReason: string | null
  contract: ContractState
  /** The request to open on /firma/:id while the contract waits for the signature. */
  contractRequestId: string | null
  contractTitle: string | null
  confirmed: boolean
  /** Accept and decline are possible now. */
  answerable: boolean
}

/** GET /api/staff/convocations */
export interface MyConvocations {
  /** Approved staff can answer; the others only see their history. */
  approved: boolean
  items: MyConvocation[]
}

/** GET /api/staff/home */
export interface StaffHome {
  status: StaffStatus
  toAnswer: MyConvocation[]
  /** Accepted convocations of sessions that have not ended. */
  upcoming: MyConvocation[]
  /** Sessions not started yet: how many the person said they can come to, out of how many. */
  availability: { available: number; total: number }
  /** The personal sheet has every required field (the home asks for it once approved). */
  sheetComplete: boolean
}

/** A session of /staff/disponibilita with the person's answer. */
export interface MyAvailabilitySession extends AvailabilitySession {
  available: boolean
  /** The person has a convocation to it (sent or accepted): the availability stays, it no longer matters. */
  convoked: boolean
}

/** GET /api/staff/availability */
export interface MyAvailability {
  /** Answers can be given and changed (approved staff only). */
  canEdit: boolean
  /** The sessions not started yet, by date. */
  sessions: MyAvailabilitySession[]
}

/** POST /api/staff/convocations/:id/accept */
export interface AcceptResult {
  /** The contract to sign now, if the session has one. */
  signatureRequestId: string | null
}
