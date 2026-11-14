// The canteen summary of a session (docs/spec.md 3.14): how many eat at each meal and who needs what, with
// names, as the camp sends it to the supplier. Pure functions, shared by the Mensa tab and its CSV.
import { ALLERGIES, DIETS, HEALTH_LABELS } from '../content/member-form'
import type { UsefulInfo } from '../types/domain'
import { formatDayRange, plural } from './format'

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

/** The text for the supplier: «Totale pasti 72 di cui: 5 senza lattosio (…)». */
export function canteenText(
  summary: CanteenSummary & { session: { title: string; startDate: string; endDate: string } },
): string {
  const { session } = summary
  return [
    `${session.title}, ${formatDayRange(session.startDate, session.endDate)}`,
    '',
    `Totale pasti ${summary.total} (${plural(summary.total, 'persona', 'persone')} a ogni pasto)${summary.needs.length ? ' di cui:' : ''}`,
    ...summary.needs.map(need => `${need.people.length} ${need.label} (${need.people.join(', ')})`),
    ...(summary.notes.length ? ['', 'Da sapere:', ...summary.notes.map(note => `${note.name}: ${note.text}`)] : []),
  ].join('\n')
}
