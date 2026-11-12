// The lodgings of the camp and the families placed in them (docs/spec.md 3.11). Pure functions, shared
// by the Alloggi page, the Alloggi tab of a session and the CSV of its layout.
import { ACCOMMODATION_NEED_FEATURES } from '../content/family-form'
import type { FormAnswers } from '../types/domain'
import { LODGING_FEATURES, enumLabel, type LodgingFeature } from './constants'
import { plural } from './format'

/** The heading of the lodgings without an area. */
export const NO_AREA = 'Altri alloggi'

/** The features a family asked for in "Esigenze per l'alloggio" (answers stored as labels). */
export function accommodationNeeds(answers: FormAnswers | null | undefined): LodgingFeature[] {
  const value = answers?.accommodationNeeds
  const labels = Array.isArray(value) ? value : []
  return LODGING_FEATURES.filter(feature => labels.some(label => ACCOMMODATION_NEED_FEATURES[label] === feature))
}

/** "Cucina, Microonde". */
export function featureLabels(features: readonly LodgingFeature[]): string {
  return features.map(feature => enumLabel('lodgingFeature', feature)).join(', ')
}

/**
 * Lodgings in the order of the layout: by area (those without one last), then by name, "Casa 2" before
 * "Casa 10". Areas compare exactly, so that each one stays together under its heading (groupByArea).
 */
export function sortLodgings<T extends { name: string; area: string | null }>(lodgings: T[]): T[] {
  return [...lodgings].sort(
    (a, b) =>
      (a.area === null ? 1 : 0) - (b.area === null ? 1 : 0) ||
      (a.area ?? '').localeCompare(b.area ?? '', 'it', { numeric: true }) ||
      a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }),
  )
}

/** Sorted lodgings under their area, in order. */
export function groupByArea<T extends { area: string | null }>(lodgings: T[]): { area: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const lodging of lodgings) {
    const area = lodging.area ?? NO_AREA
    groups.set(area, [...(groups.get(area) ?? []), lodging])
  }
  return [...groups.entries()].map(([area, items]) => ({ area, items }))
}

/**
 * What does not fit when a family sleeps in a lodging: more people than beds, a need it lacks. A family
 * without cards cannot be checked against the beds: the interface says so where it shows its size.
 */
export function lodgingWarnings(
  family: { people: number; needs: readonly LodgingFeature[] },
  lodging: { beds: number; features: readonly LodgingFeature[] },
): string[] {
  const warnings: string[] = []
  if (family.people > lodging.beds) {
    warnings.push(`${family.people} persone e ${plural(lodging.beds, 'posto letto', 'posti letto')}`)
  }
  const missing = family.needs.filter(need => !lodging.features.includes(need))
  if (missing.length) warnings.push(`Manca: ${featureLabels(missing)}`)
  return warnings
}
