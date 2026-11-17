import { z } from 'zod'
import { LODGING_FEATURES, LODGING_LOCATIONS } from '../utils/constants'
import { zOptionalText, zRequiredText, zUuid } from './common'

/** How many beds of a kind: none is fine. */
const bedCount = z
  .number({ error: 'Indica un numero, anche 0' })
  .int({ error: 'Serve un numero intero' })
  .min(0, { error: 'Non può essere negativo' })
  .max(20, { error: 'Al massimo 20' })
  .default(0)

/** A lodging of the camp (docs/spec.md 3.11): what the bed layout says about it. */
export const lodgingSchema = z.object({
  name: zRequiredText(80),
  location: z.enum(LODGING_LOCATIONS, { error: 'Scegli la località' }),
  beds: z
    .number({ error: 'Indica i posti letto' })
    .int({ error: 'Serve un numero intero' })
    .min(1, { error: 'Almeno 1 posto letto' })
    .max(50, { error: 'Al massimo 50' }),
  singleBeds: bedCount,
  doubleBeds: bedCount,
  sofaBeds: bedCount,
  accessible: z.boolean().default(false),
  features: z
    .array(z.enum(LODGING_FEATURES))
    .max(LODGING_FEATURES.length)
    .default([])
    .transform(features => LODGING_FEATURES.filter(feature => features.includes(feature))),
  description: zOptionalText(300),
})
export type LodgingInput = z.input<typeof lodgingSchema>
export type LodgingValues = z.output<typeof lodgingSchema>

/** The lodging of a family in a session; null takes it away. */
export const lodgingAssignmentSchema = z.object({ lodgingId: zUuid.nullable() })
