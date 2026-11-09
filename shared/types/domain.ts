import type { ConvocationStatus, ParticipationKind, ParticipationStatus } from '../utils/constants'

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
