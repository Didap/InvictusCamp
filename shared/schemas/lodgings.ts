import { z } from 'zod'
import { LODGING_FEATURES } from '../utils/constants'
import { zRequiredText, zText, zUuid } from './common'

/** Optional free text: empty becomes null. */
const zOptionalText = (max: number) =>
  zText(max)
    .nullish()
    .transform(value => value || null)

/** A lodging of the camp (docs/spec.md 3.11): what the bed layout says about it. */
export const lodgingSchema = z.object({
  name: zRequiredText(80),
  area: zOptionalText(80),
  beds: z
    .number({ error: 'Indica i posti letto' })
    .int({ error: 'Serve un numero intero' })
    .min(1, { error: 'Almeno 1 posto letto' })
    .max(50, { error: 'Al massimo 50' }),
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
