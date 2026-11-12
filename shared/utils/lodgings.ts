// The lodgings of the camp and the families placed in them (docs/spec.md 3.11). Pure functions, shared
// by the Alloggi tab and the CSV of the layout.
import { ACCOMMODATION_NEED_FEATURES } from '../content/family-form'
import type { FormAnswers } from '../types/domain'
import { LODGING_FEATURES, enumLabel, type LodgingFeature } from './constants'

/** The features a family asked for in "Esigenze per l'alloggio" (answers stored as labels). */
export function accommodationNeeds(answers: FormAnswers | null | undefined): LodgingFeature[] {
  const value = answers?.accommodationNeeds
  const labels = Array.isArray(value) ? value : []
  return LODGING_FEATURES.filter(feature => labels.some(label => ACCOMMODATION_NEED_FEATURES[label] === feature))
}

/** Lodgings in the order of the layout: by area (those without one last), then by name, "Casa 2" before "Casa 10". */
export function sortLodgings<T extends { name: string; area: string | null }>(lodgings: T[]): T[] {
  const compare = (a: string, b: string) => a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' })
  return [...lodgings].sort(
    (a, b) =>
      (a.area === null ? 1 : 0) - (b.area === null ? 1 : 0) ||
      compare(a.area ?? '', b.area ?? '') ||
      compare(a.name, b.name),
  )
}

/** What does not fit when a family sleeps in a lodging: more people than beds, a need it lacks. */
export function lodgingWarnings(
  family: { people: number; needs: readonly LodgingFeature[] },
  lodging: { beds: number; features: readonly LodgingFeature[] },
): string[] {
  const warnings: string[] = []
  if (family.people > lodging.beds) {
    warnings.push(`${family.people} persone e ${lodging.beds === 1 ? '1 posto letto' : `${lodging.beds} posti letto`}`)
  }
  const missing = family.needs.filter(need => !lodging.features.includes(need))
  if (missing.length) warnings.push(`Manca: ${missing.map(need => enumLabel('lodgingFeature', need)).join(', ')}`)
  return warnings
}
