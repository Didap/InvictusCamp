import { z } from 'zod'
import type { ProgrammeGroupTurn } from '../types/domain'
import { PROGRAMME_BLOCK_KINDS, PROGRAMME_GROUPS, type ProgrammeGroup } from '../utils/constants'
import { zRequiredText, zText } from './common'

const MAX_PROGRAMME_DAYS = 14
const MAX_BLOCKS_PER_DAY = 30
export const MAX_ACTIVITIES = 20
/** The years a programme can be made for. */
const MIN_PROGRAMME_YEAR = 2024
const MAX_PROGRAMME_YEAR = 2100

/** 'HH:MM', or '' for a block without a time (breakfast, departure). */
const zTime = z.union([
  z.literal(''),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Orario non valido, per esempio 09:30' }),
])

const zId = z.string().min(1).max(40)

const groupTurnSchema = z.object({
  // Null (or cleared: undefined) while still to decide.
  activity: zText(80)
    .nullish()
    .transform(value => value || null),
  lead: zText(120),
})

/** Every group with no activity yet: the turns of a new `groups` block. */
export function emptyTurns(): Record<ProgrammeGroup, ProgrammeGroupTurn> {
  return Object.fromEntries(PROGRAMME_GROUPS.map(group => [group, { activity: null, lead: '' }])) as Record<
    ProgrammeGroup,
    ProgrammeGroupTurn
  >
}

/**
 * One block (the form of the block editor and every block of a saved programme). Times in order; only
 * `groups` blocks keep the turns of the groups, and always have all of them.
 */
export const programmeBlockSchema = z
  .object({
    id: zId,
    start: zTime,
    end: zTime,
    title: zRequiredText(120),
    kind: z.enum(PROGRAMME_BLOCK_KINDS),
    note: zText(500),
    staffNote: zText(500),
    lead: zText(120),
    isNew: z.boolean(),
    toConfirm: z.boolean(),
    groups: z.record(z.enum(PROGRAMME_GROUPS), groupTurnSchema).optional(),
  })
  .refine(block => !block.end || !!block.start, { error: 'Indica anche l’inizio', path: ['start'] })
  .refine(block => !block.start || !block.end || block.end > block.start, {
    error: 'La fine viene dopo l’inizio',
    path: ['end'],
  })
  .transform(({ groups, ...block }) => (block.kind === 'groups' ? { ...block, groups: groups ?? emptyTurns() } : block))

const programmeDaySchema = z.object({
  id: zId,
  name: zRequiredText(40),
  subtitle: zText(60),
  blocks: z
    .array(programmeBlockSchema)
    .max(MAX_BLOCKS_PER_DAY, { error: `Al massimo ${MAX_BLOCKS_PER_DAY} blocchi al giorno` }),
})

/** The whole week (programmes.content). */
export const programmeContentSchema = z
  .object({
    days: z.array(programmeDaySchema).min(1).max(MAX_PROGRAMME_DAYS),
    activities: z.array(zRequiredText(80)).max(MAX_ACTIVITIES, { error: `Al massimo ${MAX_ACTIVITIES} attività` }),
  })
  .superRefine((content, ctx) => {
    const ids = content.days.flatMap(day => [day.id, ...day.blocks.map(block => block.id)])
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Due elementi hanno lo stesso id' })
    const names = content.activities.map(activity => activity.toLowerCase())
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: 'custom', message: 'Un’attività compare due volte', path: ['activities'] })
    }
  })

/** Save a programme with the id and revision it was loaded at, so that two people do not overwrite each other. */
export const programmeSaveSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().min(1),
  content: programmeContentSchema,
})
export type ProgrammeSaveInput = z.input<typeof programmeSaveSchema>
export type ProgrammeSaveValues = z.output<typeof programmeSaveSchema>

const zYear = z
  .number({ error: 'Indica l’anno' })
  .int({ error: 'Indica l’anno' })
  .min(MIN_PROGRAMME_YEAR, { error: `Dal ${MIN_PROGRAMME_YEAR}` })
  .max(MAX_PROGRAMME_YEAR, { error: `Fino al ${MAX_PROGRAMME_YEAR}` })

/** Create the programme of a year: from the model week, empty, or as a copy of another year. */
export const programmeCreateSchema = z.object({
  year: zYear,
  from: z.union([z.enum(['template', 'empty']), zYear]),
})
export type ProgrammeCreateInput = z.input<typeof programmeCreateSchema>

/** The `year` of /api/admin/programmes/[year]. */
export const programmeYearParamsSchema = z.object({ year: z.coerce.number().pipe(zYear) })
