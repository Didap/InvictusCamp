// The lodgings of the camp and the families placed in them (docs/spec.md 3.11). Pure functions, shared
// by the Alloggi page, the Alloggi tab of a session and the CSV of its layout.
import { ACCOMMODATION_NEED_LABELS } from '../content/family-form'
import type { FormAnswers } from '../types/domain'
import { LODGING_FEATURES, enumLabel, type LodgingFeature } from './constants'
import { plural } from './format'

/** The heading of the lodgings without an area. */
const NO_AREA = 'Altri alloggi'

const byArea = new Intl.Collator('it', { numeric: true })
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

/**
 * Lodgings in the order of the layout: by area (those without one last), then by name, "Casa 2" before
 * "Casa 10". Areas compare exactly, so that each one stays together under its heading (groupByArea).
 */
export function sortLodgings<T extends { name: string; area: string | null }>(lodgings: T[]): T[] {
  return [...lodgings].sort(
    (a, b) =>
      (a.area === null ? 1 : 0) - (b.area === null ? 1 : 0) ||
      byArea.compare(a.area ?? '', b.area ?? '') ||
      byName.compare(a.name, b.name),
  )
}

/** Sorted lodgings under their area, in order. */
export function groupByArea<T extends { area: string | null }>(lodgings: T[]): { area: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const lodging of lodgings) {
    const area = lodging.area ?? NO_AREA
    const items = groups.get(area)
    if (items) items.push(lodging)
    else groups.set(area, [lodging])
  }
  return [...groups.entries()].map(([area, items]) => ({ area, items }))
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
  S extends { lodgingId: string | null } = never,
>(lodgings: L[], families: F[], staff: S[] = []): (L & { family: F | undefined; staff: S[]; warnings: string[] })[] {
  const byLodging = new Map(families.flatMap(family => (family.lodgingId ? [[family.lodgingId, family] as const] : [])))
  const staffBy = new Map<string, S[]>()
  for (const person of staff) {
    if (person.lodgingId) staffBy.set(person.lodgingId, [...(staffBy.get(person.lodgingId) ?? []), person])
  }
  return lodgings.map(lodging => {
    const family = byLodging.get(lodging.id)
    const guests = staffBy.get(lodging.id) ?? []
    const warnings = family ? lodgingWarnings(family, lodging) : []
    if (guests.length > lodging.beds) warnings.push(`${guests.length} persone e ${bedsLabel(lodging.beds)}`)
    return { ...lodging, family, staff: guests, warnings }
  })
}
