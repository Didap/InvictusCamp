import type {
  ConvocationStatus,
  ParticipationKind,
  ParticipationStatus,
  ProgrammeBlockKind,
  ProgrammeGroup,
} from '../utils/constants'

/**
 * Answers to the questions of the family data (shared/content/family-form.ts), keyed by question id.
 */
export type FormAnswers = Record<string, string | string[] | boolean | null>

/**
 * Disability details of a family member (special category data, GDPR art. 9: visible to the family
 * and to the administration only). Placeholder fields until the sprint 2 form defines them.
 */
export interface DisabilityInfo {
  /** Diagnosi o descrizione della condizione. */
  description?: string
  /** Bisogni di supporto nella giornata. */
  supportNeeds?: string
  /** Mobilità e ausili. */
  mobility?: string
  /** Comunicazione. */
  communication?: string
  /** Terapie, allergie, note mediche. */
  medicalNotes?: string
}

/** Who a communication from the dashboard goes to (resolved by server/domain/audiences.ts). */
export type Audience =
  | { type: 'all_families' }
  | { type: 'all_staff' }
  | { type: 'staff_candidates' }
  | {
      type: 'session_families'
      sessionId: string
      kinds?: ParticipationKind[]
      statuses?: ParticipationStatus[]
    }
  | { type: 'session_staff'; sessionId: string; statuses?: ConvocationStatus[] }
  | { type: 'users'; userIds: string[] }

export type AudienceType = Audience['type']

/** One group's turn in a `groups` block: the activity (null = still to decide) and who leads it. */
export interface ProgrammeGroupTurn {
  activity: string | null
  lead: string
}

/**
 * A block of the week programme (docs/spec.md 3.10). Times are 'HH:MM' or '' (no time, e.g. breakfast).
 * `note` is for everyone in the session; `staffNote`, `isNew` and `toConfirm` are planning aids:
 * families never receive them (server/domain/programmes.ts, programmeForViewer).
 */
export interface ProgrammeBlock {
  id: string
  start: string
  end: string
  title: string
  kind: ProgrammeBlockKind
  note: string
  staffNote: string
  /** Who leads the block. */
  lead: string
  /** New compared with the previous year. */
  isNew: boolean
  /** Still to confirm. */
  toConfirm: boolean
  /** Only on `groups` blocks: what each group does. */
  groups?: Record<ProgrammeGroup, ProgrammeGroupTurn>
}

export interface ProgrammeDay {
  id: string
  /** e.g. Lunedì. */
  name: string
  /** e.g. Arrivo. */
  subtitle: string
  blocks: ProgrammeBlock[]
}

/** The week of a programme (jsonb of `programmes.content`). */
export interface ProgrammeContent {
  days: ProgrammeDay[]
  /** The activities the groups rotate through, in the order the rotation lists them. */
  activities: string[]
}
