// DTOs of the documents area (A4): documents of the administration, signature requests, the signing page.
import type { DocumentCategory, SessionStatus, SignatureStatus, UserRole } from '../utils/constants'
import type { FileDto } from './api'

/** A session as the documents area shows it (choices in the assign dialog, links). */
export interface DocumentSessionRef {
  id: string
  title: string
  startDate: string
  endDate: string
  status: SessionStatus
}

/** Requests not cancelled, and how many of them are signed (or read, for a document to read). */
export interface SignatureProgress {
  assigned: number
  signed: number
}

/** GET /api/admin/documents (and ?sessionId=, where the progress counts the requests of that session). */
export interface DocumentListItem {
  id: string
  title: string
  category: DocumentCategory
  /** False for a document to read: the person confirms the reading, without a code. */
  requiresSignature: boolean
  session: { id: string; title: string } | null
  progress: SignatureProgress
  createdAt: string
  archivedAt: string | null
}

/** Someone a document can be assigned to: active family and staff accounts. */
export interface AssignablePerson {
  id: string
  name: string
  email: string
  role: Extract<UserRole, 'family' | 'staff'>
  /** "Famiglia Rossi" for a family account. */
  familyName: string | null
}

/** GET /api/admin/documents/options: the choices of the upload and assign dialogs. */
export interface DocumentOptions {
  sessions: DocumentSessionRef[]
  people: AssignablePerson[]
  documents: { id: string; title: string; requiresSignature: boolean; sessionId: string | null }[]
}

/** The person of a request, as the administration sees it. */
export interface SignaturePerson {
  id: string
  name: string
  email: string
  role: UserRole
  familyName: string | null
}

/** One request in the tables of the administration (document page, account page). */
export interface SignatureRequestRow {
  id: string
  status: SignatureStatus
  person: SignaturePerson
  document: { id: string; title: string; category: DocumentCategory; requiresSignature: boolean }
  sessionId: string | null
  requestedAt: string
  dueDate: string | null
  remindedAt: string | null
  signedAt: string | null
  /** The full name typed by the signer. */
  signedName: string | null
  /** A signed copy can be downloaded (generated at the first download when missing). */
  hasSignedCopy: boolean
}

/** GET /api/admin/documents/:id */
export interface DocumentDetail extends DocumentListItem {
  description: string | null
  file: FileDto & { sha256: string }
  createdBy: string | null
  /** Somebody has already signed or read it: the file can no longer be replaced. */
  locked: boolean
  requests: SignatureRequestRow[]
}

/** Who receives a document (POST /api/admin/documents/:id/assign). */
export type AssignTarget =
  | { type: 'users'; userIds: string[] }
  | { type: 'all_families' }
  | { type: 'all_staff' }
  | { type: 'session_families'; sessionId: string }
  | { type: 'session_staff'; sessionId: string }

export type AssignTargetType = AssignTarget['type']

/** The answer of an assignment, or of its dry run (the numbers of the confirmation). */
export interface AssignResult {
  /** People the target resolves to (active accounts). */
  recipients: number
  /** Of those, how many already have the document (to sign or signed): they receive nothing. */
  alreadyAssigned: number
  /** New or reopened requests, one email each. */
  created: number
  dryRun: boolean
}

/** POST /api/admin/documents/:id/remind, POST /api/admin/signatures/:id/remind */
export interface RemindResult {
  emails: number
}

/** GET /api/signatures: the documents of the signed-in account. */
export interface MySignatureItem {
  id: string
  status: SignatureStatus
  document: { title: string; category: DocumentCategory; requiresSignature: boolean }
  requestedAt: string
  dueDate: string | null
  signedAt: string | null
}

/** GET /api/signatures/:id: the signing page. */
export interface SignaturePage {
  id: string
  status: SignatureStatus
  document: {
    title: string
    description: string | null
    category: DocumentCategory
    requiresSignature: boolean
    file: FileDto
  }
  dueDate: string | null
  requestedAt: string
  signedAt: string | null
  signedName: string | null
  /** Where the code is sent. */
  email: string
  /** The full name of the account, as a hint for the typed name. */
  accountName: string
  /** The last code sent, while it can still be used. */
  code: SignatureCodeState | null
}

export interface SignatureCodeState {
  expiresAt: string
  /** A new code can be asked from this instant. */
  resendAt: string
  attemptsLeft: number
}
