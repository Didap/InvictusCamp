// Places of a session: titolari hold one of `familySlots`; reserves wait in `reserveRank` order and
// are called (promoted to titolare) when a place frees up. Pure functions, shared by the server
// (server/domain/sessions.ts enforces them) and the interface (it shows the counts).
import type { ParticipationKind, ParticipationStatus } from './constants'

export interface SlotParticipation {
  id: string
  kind: ParticipationKind
  status: ParticipationStatus
  reserveRank: number | null
  createdAt?: string | Date
}

const HOLDING: readonly ParticipationStatus[] = ['selected', 'invited', 'confirmed']

/** A titolare holds a place unless the family declined or the participation was cancelled. */
export function holdsSlot(participation: SlotParticipation): boolean {
  return participation.kind === 'slot' && HOLDING.includes(participation.status)
}

/** A reserve is still waiting to be called. */
export function isWaitingReserve(participation: SlotParticipation): boolean {
  return participation.kind === 'reserve' && (participation.status === 'selected' || participation.status === 'invited')
}

export function occupiedSlots(participations: SlotParticipation[]): number {
  return participations.filter(holdsSlot).length
}

export function freeSlots(familySlots: number, participations: SlotParticipation[]): number {
  return Math.max(0, familySlots - occupiedSlots(participations))
}

function timeOf(value: string | Date | undefined): number {
  if (!value) return 0
  return typeof value === 'string' ? Date.parse(value) : value.getTime()
}

/** Reserves still waiting, in calling order (rank, then the order they were added). */
export function waitingReserves<T extends SlotParticipation>(participations: T[]): T[] {
  return participations
    .filter(isWaitingReserve)
    .sort(
      (a, b) =>
        (a.reserveRank ?? Number.MAX_SAFE_INTEGER) - (b.reserveRank ?? Number.MAX_SAFE_INTEGER) ||
        timeOf(a.createdAt) - timeOf(b.createdAt),
    )
}

/** The reserve to call next, if any. */
export function nextReserve<T extends SlotParticipation>(participations: T[]): T | undefined {
  return waitingReserves(participations)[0]
}

/** Rank for a reserve added at the end of the list. */
export function nextReserveRank(participations: SlotParticipation[]): number {
  return (
    participations.reduce((max, p) => (p.kind === 'reserve' && p.reserveRank ? Math.max(max, p.reserveRank) : max), 0) +
    1
  )
}

/** Counts shown on a session: places, held, confirmed, free, reserves waiting. */
export function slotSummary(familySlots: number, participations: SlotParticipation[]) {
  return {
    total: familySlots,
    held: occupiedSlots(participations),
    confirmed: participations.filter(p => p.kind === 'slot' && p.status === 'confirmed').length,
    free: freeSlots(familySlots, participations),
    reserves: participations.filter(isWaitingReserve).length,
  }
}
