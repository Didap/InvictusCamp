// Pure helpers of the week programme (docs/spec.md 3.10), shared by the editor and the read-only week.
import type { ProgrammeBlock, ProgrammeContent } from '../types/domain'
import {
  PROGRAMME_GROUPS,
  type ConvocationStatus,
  type ParticipationStatus,
  type ProgrammeGroup,
  type SessionStatus,
} from './constants'
import { weekdayIndex } from './dates'
import { formatDay } from './format'

/** A family reads the programme of a session it is invited to or confirmed in, unless cancelled. */
export function canFamilyReadProgramme(participation: ParticipationStatus, session: SessionStatus): boolean {
  return (participation === 'invited' || participation === 'confirmed') && session !== 'cancelled'
}

/** A staff member reads it once they accepted the convocation, unless the session is cancelled. */
export function canStaffReadProgramme(convocation: ConvocationStatus, session: SessionStatus): boolean {
  return convocation === 'accepted' && session !== 'cancelled'
}

/** '10:00–12:30', '20:00' (open end) or '' (no time). */
export function blockTime(block: Pick<ProgrammeBlock, 'start' | 'end'>): string {
  if (!block.start) return ''
  return block.end ? `${block.start}–${block.end}` : block.start
}

/** A block dragged from one place to another; `newIndex` counts after the block left its place. */
export interface BlockMove {
  from: string
  oldIndex: number
  to: string
  newIndex: number
}

/** Moves a block of `content` (the drag of the editor, and "Sposta su/giù" in its menu). */
export function moveBlock(content: ProgrammeContent, move: BlockMove): void {
  const from = content.days.find(day => day.id === move.from)
  const to = content.days.find(day => day.id === move.to)
  const block = from?.blocks[move.oldIndex]
  if (!from || !to || !block) return
  from.blocks.splice(move.oldIndex, 1)
  to.blocks.splice(Math.min(move.newIndex, to.blocks.length), 0, block)
}

/**
 * Puts `block` among `blocks` by its start time: before the first block that starts later, at the end
 * otherwise. Blocks without a time stay where they are; a block without a time goes at the end.
 */
export function placeBlock(blocks: ProgrammeBlock[], block: ProgrammeBlock): ProgrammeBlock[] {
  const index = block.start ? blocks.findIndex(other => !!other.start && other.start > block.start) : -1
  return index < 0 ? [...blocks, block] : [...blocks.slice(0, index), block, ...blocks.slice(index)]
}

interface GroupRotation {
  group: ProgrammeGroup
  /** The group's turns in week order: the day, the time and the activity (null = to decide). */
  turns: { day: string; time: string; activity: string | null }[]
  /** Activities of the list the group never does. */
  missing: string[]
  /** Activities the group does more than once. */
  repeated: string[]
  /** Activities in its turns that are no longer in the list. */
  unlisted: string[]
}

/** What each group does across the week, and where the rotation does not cover every activity once. */
export function groupRotation(content: ProgrammeContent): GroupRotation[] {
  return PROGRAMME_GROUPS.map(group => {
    const turns = content.days.flatMap(day =>
      day.blocks
        .filter(block => block.kind === 'groups' && block.groups)
        .map(block => ({ day: day.name, time: blockTime(block), activity: block.groups![group].activity })),
    )
    const counts = new Map<string, number>()
    for (const turn of turns) if (turn.activity) counts.set(turn.activity, (counts.get(turn.activity) ?? 0) + 1)
    return {
      group,
      turns,
      missing: content.activities.filter(activity => !counts.has(activity)),
      repeated: [...counts].filter(([, count]) => count > 1).map(([activity]) => activity),
      unlisted: [...counts.keys()].filter(activity => !content.activities.includes(activity)),
    }
  })
}

interface OpenPoint {
  blockId: string
  text: string
}

/** Blocks still to confirm and group turns with no activity yet. */
export function openPoints(content: ProgrammeContent): OpenPoint[] {
  return content.days.flatMap(day =>
    day.blocks.flatMap(block => {
      const where = [day.name, blockTime(block)].filter(Boolean).join(' ')
      const points: OpenPoint[] = []
      if (block.toConfirm) points.push({ blockId: block.id, text: `${where}: ${block.title}, da confermare` })
      const undecided = block.groups ? PROGRAMME_GROUPS.filter(group => !block.groups![group].activity).length : 0
      if (undecided) {
        points.push({
          blockId: block.id,
          text: `${where}: ${undecided === 1 ? 'un gruppo' : `${undecided} gruppi`} senza attività`,
        })
      }
      return points
    }),
  )
}

/** The names of the week's days, Monday first (weekdayIndex). */
export const WEEKDAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

const plainWeekdays = WEEKDAY_NAMES.map(name => plainWord(name))
function plainWord(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** The weekday a day's name starts with ("Sabato", "venerdi sera": 5, 4), or -1 ("Giorno 1", "Arrivo"). */
export function weekdayOfName(name: string): number {
  return plainWeekdays.indexOf(plainWord(name.trim().split(/\s+/)[0] ?? ''))
}

/** The name to suggest for a day added after the last one: the next weekday, or "Giorno N". */
export function nextDayName(content: ProgrammeContent): string {
  const last = content.days.at(-1)
  const weekday = last ? weekdayOfName(last.name) : -1
  const name = weekday < 0 ? `Giorno ${content.days.length + 1}` : WEEKDAY_NAMES[(weekday + 1) % 7]!
  return content.days.some(day => day.name.toLowerCase() === name.toLowerCase()) ? '' : name
}

/**
 * What follows each day's name: "21 giugno 2027 · Arrivo", the date, then the subtitle. Day one is the
 * first day of the session, and so on. The dates appear only for a session at least as long as the
 * programme whose dates fall on the weekdays the days are named after (a week from Monday starts on a
 * Monday, a weekend from Friday on a Friday); days with other names ("Giorno 1") take any date.
 */
export function dayCaptions(content: ProgrammeContent, dates: string[] | undefined): string[] {
  const dated =
    !!dates &&
    dates.length >= content.days.length &&
    content.days.every((day, i) => {
      const weekday = weekdayOfName(day.name)
      return weekday < 0 || weekday === weekdayIndex(dates[i]!)
    })
  return content.days.map((day, i) =>
    [dated ? formatDay(dates![i]!, 'long') : '', day.subtitle].filter(Boolean).join(' · '),
  )
}
