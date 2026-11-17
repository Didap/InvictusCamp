// The canteen summary of a session (docs/spec.md 3.14): how many eat at each meal and who needs what, with
// names, as the camp sends it to the supplier. Pure functions, shared by the Mensa tab, its CSV and its PDF.
import { ALLERGIES, DIETS, HEALTH_LABELS } from '../content/member-form'
import type { UsefulInfo } from '../types/domain'
import { andList, formatDayRange, plural } from './format'

/** Someone who eats at the camp in the session: a member of a family holding a place, or of the staff. */
export interface CanteenPerson {
  name: string
  info: UsefulInfo | null
  /** «Selettività alimentare» of a young person with a condition. */
  foodSelectivity: string | null
}

export interface CanteenSummary {
  /** People at each meal. */
  total: number
  /** «senza lattosio», «vegetariana»: in the order of the lists, only those someone needs. */
  needs: { label: string; people: string[] }[]
  /** Food selectivity and other notes, one per person and kind. */
  notes: { name: string; text: string }[]
}

export function canteenSummary(people: CanteenPerson[]): CanteenSummary {
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name, 'it'))
  const who = (has: (info: UsefulInfo) => boolean) => sorted.filter(p => p.info && has(p.info)).map(p => p.name)
  return {
    total: people.length,
    needs: [
      ...ALLERGIES.map(item => ({ label: item.canteen, people: who(info => !!info.allergies?.includes(item.value)) })),
      ...DIETS.map(item => ({ label: item.canteen, people: who(info => info.diet === item.value) })),
    ].filter(need => need.people.length),
    notes: sorted.flatMap(person => [
      ...(person.foodSelectivity
        ? [{ name: person.name, text: `${HEALTH_LABELS.foodSelectivity}: ${person.foodSelectivity}` }]
        : []),
      ...(person.info?.notes ? [{ name: person.name, text: person.info.notes }] : []),
    ]),
  }
}

/** Who eats, by group: everyone in the session, families, staff and v-team. */
export interface CanteenGroups {
  /** Families holding a place with their members indicated, and those members. */
  families: number
  familyPeople: number
  /** The staff and the v-team still in play. */
  staff: number
  volunteers: number
  /** Families holding a place without cards: their people are not counted yet. */
  withoutCards: string[]
}

/** «60 di 12 famiglie, 10 dello staff e 2 del v-team»: only the groups with someone. */
export function canteenWho(groups: CanteenGroups): string {
  const parts = [
    ...(groups.families ? [`${groups.familyPeople} di ${plural(groups.families, 'famiglia', 'famiglie')}`] : []),
    ...(groups.staff ? [`${groups.staff} dello staff`] : []),
    ...(groups.volunteers ? [`${groups.volunteers} del v-team`] : []),
  ]
  return parts.length ? andList(parts) : 'nessuno'
}

/** For the supplier, how many families are not in the total yet (not who), or null. */
export function canteenNotCounted(groups: CanteenGroups): string | null {
  const count = groups.withoutCards.length
  if (!count) return null
  return count === 1
    ? '1 famiglia non ha ancora indicato i componenti e non è nel totale.'
    : `${count} famiglie non hanno ancora indicato i componenti e non sono nel totale.`
}

export interface CanteenSession {
  title: string
  startDate: string
  endDate: string
}

/** The text for the supplier: «Totale pasti 72 di cui: 5 senza lattosio (…)». */
export function canteenText(summary: CanteenSummary & CanteenGroups & { session: CanteenSession }): string {
  const { session } = summary
  const notCounted = canteenNotCounted(summary)
  return [
    `${session.title}, ${formatDayRange(session.startDate, session.endDate)}`,
    '',
    `Totale pasti ${summary.total} (persone a ogni pasto: ${canteenWho(summary)})${summary.needs.length ? ' di cui:' : ''}`,
    ...summary.needs.map(need => `${need.people.length} ${need.label} (${need.people.join(', ')})`),
    ...(notCounted ? ['', notCounted] : []),
    ...(summary.notes.length ? ['', 'Da sapere:', ...summary.notes.map(note => `${note.name}: ${note.text}`)] : []),
  ].join('\n')
}
