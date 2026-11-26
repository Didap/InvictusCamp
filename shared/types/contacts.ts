// The «Anagrafica» (docs/spec.md 3.16).
import type { ContactKind, UserRole } from '../utils/constants'

export interface ContactListItem {
  id: string
  kind: ContactKind
  firstName: string
  lastName: string
  email: string
  groupIds: string[]
  /** The role of the account with the same email, if there is one. */
  accountRole: UserRole | null
  createdAt: string
}

export interface ContactGroupItem {
  id: string
  name: string
  /** How many contacts are in it. */
  count: number
}

export interface ContactImportResult {
  /** New contacts. */
  created: number
  /** Already in the registry (by email). */
  existing: number
  /** Of the existing ones, those whose type or names changed. */
  updated: number
}
