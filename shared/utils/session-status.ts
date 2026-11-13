// The life of a session (docs/spec.md, 3.1). Every move is an explicit action of the administration;
// the families' invitations go out when the session changes status. server/domain/sessions.ts applies
// the moves and builds the emails; the interface uses these tables to offer only the valid moves.
import type { ParticipationStatus, SessionStatus } from './constants'

export const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  draft: ['inviting', 'cancelled'],
  inviting: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS[from].includes(to)
}

/** The button label of each move, from the point of view of the administration. */
export const SESSION_TRANSITION_ACTIONS: Record<SessionStatus, string> = {
  draft: 'Riporta in bozza',
  inviting: 'Apri gli inviti',
  confirmed: 'Conferma la sessione',
  completed: 'Segna come conclusa',
  cancelled: 'Annulla la sessione',
}

/** What each move does on the families' side, shown before the administration confirms it. */
export const SESSION_TRANSITION_EFFECTS: Record<SessionStatus, string> = {
  draft: '',
  inviting:
    'Le famiglie titolari ricevono l’invito e possono confermare o rinunciare. Le riserve ricevono l’avviso di essere in lista.',
  confirmed: 'Le famiglie che hanno confermato ricevono la conferma definitiva della sessione.',
  completed:
    'La sessione passa nello storico. Le famiglie che hanno partecipato ricevono il questionario di fine sessione.',
  cancelled: 'Le famiglie invitate o confermate ricevono l’avviso di annullamento.',
}

/** Once a session is in one of these, a family added (or a reserve called) is invited right away. */
export const SESSION_OPEN_STATUSES: readonly SessionStatus[] = ['inviting', 'confirmed']

/** A session can still be edited (dates, places, families, staff) in these. */
export const SESSION_EDITABLE_STATUSES: readonly SessionStatus[] = ['draft', 'inviting', 'confirmed']

export function isSessionOpen(status: SessionStatus): boolean {
  return SESSION_OPEN_STATUSES.includes(status)
}

export function isSessionEditable(status: SessionStatus): boolean {
  return SESSION_EDITABLE_STATUSES.includes(status)
}

/** A family can answer (confirm or decline) while its participation is in one of these. */
export const ANSWERABLE_PARTICIPATION_STATUSES: readonly ParticipationStatus[] = ['invited']
