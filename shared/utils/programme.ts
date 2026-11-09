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

/** A family reads the programme of a session it is invited to or confirmed in, unless cancelled. */
export function canFamilyReadProgramme(participation: ParticipationStatus, session: SessionStatus): boolean {
  return (participation === 'invited' || participation === 'confirmed') && session !== 'cancelled'
}

/** A staff member reads it once they accepted the convocation, unless the session is cancelled. */
export function canStaffReadProgramme(convocation: ConvocationStatus, session: SessionStatus): boolean {
  return convocation === 'accepted' && session !== 'cancelled'
}

/** A new block id. Not crypto.randomUUID: that exists only on HTTPS and localhost. */
export function newBlockId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/** Same week, whatever the order of the keys (jsonb reorders them, a form does not). */
export function sameContent(a: ProgrammeContent, b: ProgrammeContent): boolean {
  return canonical(a) === canonical(b)
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)))
      : item,
  )
}

/** '10:00–12:30', '20:00' (open end) or '' (no time). */
export function blockTime(block: Pick<ProgrammeBlock, 'start' | 'end'>): string {
  if (!block.start) return ''
  return block.end ? `${block.start}–${block.end}` : block.start
}

/**
 * Puts `block` among `blocks` by its start time: before the first block that starts later, at the end
 * otherwise. Blocks without a time stay where they are; a block without a time goes at the end.
 */
export function placeBlock(blocks: ProgrammeBlock[], block: ProgrammeBlock): ProgrammeBlock[] {
  const index = block.start ? blocks.findIndex(other => !!other.start && other.start > block.start) : -1
  return index < 0 ? [...blocks, block] : [...blocks.slice(0, index), block, ...blocks.slice(index)]
}

export interface GroupRotation {
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

export interface OpenPoint {
  dayId: string
  blockId: string
  text: string
}

/** Blocks still to confirm and group turns with no activity yet. */
export function openPoints(content: ProgrammeContent): OpenPoint[] {
  return content.days.flatMap(day =>
    day.blocks.flatMap(block => {
      const where = [day.name, blockTime(block)].filter(Boolean).join(' ')
      const points: OpenPoint[] = []
      if (block.toConfirm)
        points.push({ dayId: day.id, blockId: block.id, text: `${where}: ${block.title}, da confermare` })
      const undecided = block.groups ? PROGRAMME_GROUPS.filter(group => !block.groups![group].activity).length : 0
      if (undecided) {
        points.push({
          dayId: day.id,
          blockId: block.id,
          text: `${where}: ${undecided === 1 ? 'un gruppo' : `${undecided} gruppi`} senza attività`,
        })
      }
      return points
    }),
  )
}

/**
 * The date of each programme day: day one is the first day of the session, and so on. The days of a
 * programme start on Monday, so the dates appear only for a session that starts on a Monday and is at
 * least as long as the programme; otherwise they would not line up with the names of the days.
 */
export function dayDates(content: ProgrammeContent, dates: string[] | undefined): (string | null)[] {
  const fits = !!dates?.length && weekdayIndex(dates[0]!) === 0 && dates.length >= content.days.length
  return content.days.map((_, i) => (fits ? dates![i]! : null))
}
