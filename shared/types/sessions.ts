// DTOs of the sessions area (sessions, places and reserves, the family's sessions). SessionListItem
// and AddFamiliesResult are contracts: the families area reads GET /api/admin/sessions and calls
// POST /api/admin/sessions/:id/families (docs/BUILD.md, "Contracts between areas").
import type {
  ParticipationKind,
  ParticipationStatus,
  SessionStatus,
  FamilyFormStatus,
  UserStatus,
  ProgrammeGroup,
} from '../utils/constants'
import type { IsoDay } from '../utils/dates'
import type { FeedbackState } from './feedback'

/** Places of a session, as slotSummary() counts them (shared/utils/slots.ts). */
export interface SlotCounts {
  /** familySlots. */
  total: number
  /** Titolari selected, invited or confirmed. */
  held: number
  /** Titolari who confirmed. */
  confirmed: number
  free: number
  /** Reserves still waiting to be called. */
  reserves: number
}

/**
 * Staff of a session. `needed` and the four counts after it are the progress of the people who count
 * toward it (the staff team, coordinators aside: countsTowardNeeded); `open` and `drafts` count every
 * convocation, whatever the team, for the actions on them.
 */
export interface StaffCounts {
  needed: number
  /** Accepted and, when the session has a contract, contract signed. */
  confirmed: number
  /** Accepted, contract signed or not. */
  accepted: number
  /** Sent, waiting for an answer. */
  waiting: number
  /** Chosen for the session, convocation not sent yet. */
  toSend: number
  /** Every convocation still in play (draft, sent, accepted). */
  open: number
  /** Every convocation not sent yet. */
  drafts: number
}

/**
 * GET /api/admin/sessions?status=draft,inviting,confirmed&q= (every status when `status` is missing).
 * Ordered upcoming first (by start date), then past (most recent first).
 */
export interface SessionListItem {
  id: string
  title: string
  location: string
  startDate: IsoDay
  endDate: IsoDay
  status: SessionStatus
  responseDeadline: IsoDay | null
  slots: SlotCounts
  staff: StaffCounts
}

/** A valid move of the session's status, with the emails it would send now. */
export interface SessionMove {
  to: SessionStatus
  /** Button label (SESSION_TRANSITION_ACTIONS). */
  label: string
  /** What the move does on the families' side (SESSION_TRANSITION_EFFECTS). */
  effect: string
  /** Emails the move sends now (disabled accounts excluded). */
  emails: number
  /** The same emails by template, e.g. { 'session.invite': 5, 'session.reserve': 2 }. */
  emailsByTemplate: Record<string, number>
}

/** GET /api/admin/sessions/:id */
export interface SessionDetail extends SessionListItem {
  description: string | null
  notes: string | null
  familySlots: number
  staffNeeded: number
  contractDocument: { id: string; title: string } | null
  statusChangedAt: string | null
  createdAt: string
  updatedAt: string
  moves: SessionMove[]
  /** A draft without families and staff can be deleted. */
  deletable: boolean
}

/** POST /api/admin/sessions, POST /api/admin/sessions/:id/duplicate */
export interface SessionCreated {
  id: string
}

/** POST /api/admin/sessions/:id/status */
export interface SessionTransitionResult {
  from: SessionStatus
  to: SessionStatus
  emails: number
}

/** GET /api/admin/sessions/contract-options : documents of category "contract" a session can use. */
export interface ContractOption {
  id: string
  title: string
  archived: boolean
}

/** A family in a session, for the administration (FamiliesPanel). Never health details. */
export interface SessionFamilyItem {
  /** The participation (session_families row). */
  id: string
  familyId: string
  familyName: string
  /** The family's account (to write to it: /admin/comunicazioni/nuova?userIds=). */
  userId: string
  /** The referent, i.e. the family's account. */
  referent: string
  email: string
  phone: string | null
  city: string | null
  accountStatus: UserStatus
  kind: ParticipationKind
  status: ParticipationStatus
  reserveRank: number | null
  invitedAt: string | null
  respondedAt: string | null
  declineReason: string | null
  /** The answer arrived after the session's answer deadline. */
  lateAnswer: boolean
  createdAt: string
}

/** GET /api/admin/sessions/:id/families */
export interface SessionFamiliesDto {
  sessionId: string
  status: SessionStatus
  familySlots: number
  responseDeadline: IsoDay | null
  slots: SlotCounts
  participations: SessionFamilyItem[]
}

/** GET /api/admin/sessions/:id/candidates?q= : families that can be added to the session. */
export interface SessionCandidate {
  id: string
  name: string
  referent: string
  city: string | null
  province: string | null
  formStatus: FamilyFormStatus
  /** Set when the family was in the session before (declined or cancelled): adding it again reuses the place. */
  previousStatus: ParticipationStatus | null
}

/**
 * POST /api/admin/sessions/:id/families, body { familyIds, kind } (AddFamiliesInput). `added`: families
 * now in the session; `invited`: those invited at once (the session is inviting or confirmed), each
 * with an email (session.invite for titolari, session.reserve for reserves).
 */
export interface AddFamiliesResult {
  added: number
  invited: number
}

/** Result of the actions on one participation (call a reserve, answer, cancel, resend). */
export interface ParticipationActionResult {
  emails: number
}

/** GET /api/admin/sessions/by-family/:familyId : the sessions of one family (FamilyHistory). */
export interface FamilyParticipationItem {
  id: string
  sessionId: string
  title: string
  startDate: IsoDay
  endDate: IsoDay
  sessionStatus: SessionStatus
  kind: ParticipationKind
  status: ParticipationStatus
  reserveRank: number | null
  invitedAt: string | null
  respondedAt: string | null
  declineReason: string | null
}

/**
 * GET /api/family/sessions : the sessions of the signed-in family, only once invited (participations
 * `selected` are invisible to families).
 */
export interface FamilySessionItem {
  /** The participation. */
  id: string
  sessionId: string
  title: string
  description: string | null
  location: string
  startDate: IsoDay
  endDate: IsoDay
  sessionStatus: SessionStatus
  responseDeadline: IsoDay | null
  kind: ParticipationKind
  status: ParticipationStatus
  invitedAt: string | null
  respondedAt: string | null
  declineReason: string | null
  /** "Conferma" can be pressed now (a titolare invited, the session open). */
  canConfirm: boolean
  /** "Rinuncia" can be pressed now (titolare or reserve invited, the session open). */
  canDecline: boolean
  /** The end-of-session questionnaire (docs/spec.md 3.13): open to answer, sent, or none. */
  feedback: FeedbackState
  /**
   * What the family lived, once the session it was confirmed in is over (docs/spec.md 3.3): its activity group
   * and who led it, its lodging, whether there is a programme. Null before then, and for a session it missed.
   */
  lived: {
    group: ProgrammeGroup | null
    groupLead: string | null
    lodging: string | null
    /** The session has a programme to read (its own or its year's). */
    hasProgramme: boolean
  } | null
}
