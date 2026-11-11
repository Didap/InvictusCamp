// DTOs of the communications area: the composer, the messages sent, the email log.
import type { EmailStatus, SessionStatus, UserRole } from '../utils/constants'
import type { Audience } from './domain'

/** A person who would receive a message. */
export interface AudienceRecipient {
  userId: string
  /** What {nome} becomes in the message. */
  firstName: string
  name: string
  email: string
  role: UserRole
}

/** POST /api/admin/communications/audience: who receives a message, before it is sent. */
export interface AudienceSummary {
  /** "Famiglie di «Sessione 1 · Giugno 2027» (titolari e riserve; stato: invitata o confermata)". */
  label: string
  count: number
  /** Accounts that match but receive nothing: disabled, invitation not accepted, address not confirmed. */
  excluded: number
  recipients: AudienceRecipient[]
}

/** A session the composer can write to. */
export interface CommunicationSessionOption {
  id: string
  title: string
  startDate: string
  endDate: string
  status: SessionStatus
}

/** GET /api/admin/communications/options */
export interface CommunicationOptions {
  sessions: CommunicationSessionOption[]
}

/** A row of GET /api/admin/communications. A draft has no `sentAt`. */
export interface CommunicationListItem {
  id: string
  subject: string
  audience: Audience
  audienceLabel: string
  recipientCount: number
  sessionId: string | null
  sessionTitle: string | null
  /** Who sent it (or wrote the draft). */
  sentByName: string | null
  sentAt: string | null
  createdAt: string
}

/** One email of a communication, with its delivery status. */
export interface CommunicationRecipient {
  emailId: string
  userId: string | null
  name: string | null
  email: string
  status: EmailStatus
  error: string | null
  createdAt: string
}

/** GET /api/admin/communications/:id */
export interface CommunicationDetail extends CommunicationListItem {
  body: string
  delivery: Record<EmailStatus, number>
  recipients: CommunicationRecipient[]
}

/** POST /api/admin/communications and POST /api/admin/communications/:id/send */
export interface CommunicationSendResult {
  id: string
  recipients: number
  sent: number
  failed: number
  simulated: number
}

/** POST /api/admin/communications/preview: the email as it will look. */
export interface EmailPreview {
  subject: string
  html: string
}

/** A row of GET /api/admin/email-log. */
export interface EmailLogItem {
  id: string
  template: string
  toEmail: string
  toUserId: string | null
  toName: string | null
  subject: string
  status: EmailStatus
  error: string | null
  /** False for access emails (links, codes): their content is never kept. */
  hasContent: boolean
  sessionId: string | null
  sessionTitle: string | null
  communicationId: string | null
  createdAt: string
}

/** GET /api/admin/email-log/:id */
export interface EmailLogDetail extends EmailLogItem {
  html: string | null
}

/** A row of GET /api/admin/email-templates: a saved message the composer starts from. */
export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  updatedAt: string
}
