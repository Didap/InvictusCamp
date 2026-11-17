// The lodgings of the camp and the families placed in them (docs/spec.md 3.11). Pure functions, shared
// by the Alloggi page, the Alloggi tab of a session and the CSV and PDF of its layout.
import { ACCOMMODATION_NEED_LABELS } from '../content/family-form'
import type { FormAnswers } from '../types/domain'
import { LODGING_FEATURES, LODGING_LOCATIONS, enumLabel, type LodgingFeature, type LodgingLocation } from './constants'
import { plural } from './format'

const byName = new Intl.Collator('it', { numeric: true, sensitivity: 'base' })

/** The features asked for in the answer "Esigenze per l'alloggio" (stored as labels). */
export function accommodationNeeds(answer: FormAnswers[string] | undefined): LodgingFeature[] {
  const labels = Array.isArray(answer) ? answer : []
  return LODGING_FEATURES.filter(feature => labels.includes(ACCOMMODATION_NEED_LABELS[feature]))
}

/** "Cucina, Microonde". */
export function featureLabels(features: readonly LodgingFeature[]): string {
  return features.map(feature => enumLabel('lodgingFeature', feature)).join(', ')
}

/** "1 posto letto", "4 posti letto". */
export function bedsLabel(beds: number): string {
  return plural(beds, 'posto letto', 'posti letto')
}

/** "1 letto matrimoniale, 2 letti singoli, 1 divano letto": only the kinds there are. */
export function bedKindsLabel(lodging: { singleBeds: number; doubleBeds: number; sofaBeds: number }): string {
  return [
    lodging.doubleBeds && plural(lodging.doubleBeds, 'letto matrimoniale', 'letti matrimoniali'),
    lodging.singleBeds && plural(lodging.singleBeds, 'letto singolo', 'letti singoli'),
    lodging.sofaBeds && plural(lodging.sofaBeds, 'divano letto', 'divani letto'),
  ]
    .filter(Boolean)
    .join(', ')
}

/** "4 posti letto (1 letto matrimoniale, 2 letti singoli) · Accessibile · Cucina, Microonde". */
export function lodgingLine(lodging: {
  beds: number
  singleBeds: number
  doubleBeds: number
  sofaBeds: number
  accessible: boolean
  features: readonly LodgingFeature[]
}): string {
  const kinds = bedKindsLabel(lodging)
  return [
    kinds ? `${bedsLabel(lodging.beds)} (${kinds})` : bedsLabel(lodging.beds),
    lodging.accessible && 'Accessibile',
    featureLabels(lodging.features),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Lodgings in the order of the layout: by location, in the order of the list, then by name, "Casa 2" before "Casa 10". */
export function sortLodgings<T extends { name: string; location: LodgingLocation }>(lodgings: T[]): T[] {
  return [...lodgings].sort(
    (a, b) =>
      LODGING_LOCATIONS.indexOf(a.location) - LODGING_LOCATIONS.indexOf(b.location) || byName.compare(a.name, b.name),
  )
}

/** Sorted lodgings under their location, in order; locations without lodgings are left out. */
export function groupByLocation<T extends { location: LodgingLocation }>(
  lodgings: T[],
): { location: LodgingLocation; label: string; items: T[] }[] {
  return LODGING_LOCATIONS.map(location => ({
    location,
    label: enumLabel('lodgingLocation', location),
    items: lodgings.filter(lodging => lodging.location === location),
  })).filter(group => group.items.length)
}

/**
 * What does not fit when a family sleeps in a lodging: more people than beds, a need it lacks. A family
 * without cards cannot be checked against the beds: where its size is shown, NO_CARDS says so.
 */
export function lodgingWarnings(
  family: { people: number; needs: readonly LodgingFeature[] },
  lodging: { beds: number; features: readonly LodgingFeature[] },
): string[] {
  const warnings: string[] = []
  if (family.people > lodging.beds) warnings.push(`${family.people} persone e ${bedsLabel(lodging.beds)}`)
  const missing = family.needs.filter(need => !lodging.features.includes(need))
  if (missing.length) warnings.push(`Manca: ${featureLabels(missing)}`)
  return warnings
}

/**
 * Each lodging of the layout with who sleeps in it, the family or the staff members, and what does not fit:
 * a family's size and needs, more staff than beds.
 */
export function placeGuests<
  L extends { id: string; beds: number; features: readonly LodgingFeature[] },
  F extends { lodgingId: string | null; people: number; needs: readonly LodgingFeature[] },
  S extends { lodgingId: string | null },
>(lodgings: L[], families: F[], staff: S[]): (L & { family: F | undefined; staff: S[]; warnings: string[] })[] {
  const byLodging = new Map(families.flatMap(family => (family.lodgingId ? [[family.lodgingId, family] as const] : [])))
  const staffBy = new Map<string, S[]>()
  for (const person of staff) {
    if (!person.lodgingId) continue
    const people = staffBy.get(person.lodgingId)
    if (people) people.push(person)
    else staffBy.set(person.lodgingId, [person])
  }
  return lodgings.map(lodging => {
    const family = byLodging.get(lodging.id)
    const guests = staffBy.get(lodging.id) ?? []
    const warnings = family ? lodgingWarnings(family, lodging) : []
    if (guests.length) warnings.push(...lodgingWarnings({ people: guests.length, needs: [] }, lodging))
    return { ...lodging, family, staff: guests, warnings }
  })
}
