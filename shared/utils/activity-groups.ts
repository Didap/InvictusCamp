// The activity groups of a session (docs/spec.md 3.12): the families holding a place split among the
// groups of the programme, Giallo, Rosso and Blu. Pure functions, shared by the Gruppi tab of a session
// and the CSV of its groups.
import type { GroupMember } from '../types/activity-groups'
import { PROGRAMME_GROUPS, type ProgrammeGroup } from './constants'
import { formatAge, plural } from './format'

export interface GroupTally {
  families: number
  people: number
}

type Groupable = { group: ProgrammeGroup | null; members: readonly unknown[] }

/** Families and people of each group; `size` says how many people a family counts as (its cards). */
export function tallyGroups<T extends Groupable>(
  families: readonly T[],
  size: (family: T) => number = family => family.members.length,
): Record<ProgrammeGroup, GroupTally> {
  const tally = Object.fromEntries(PROGRAMME_GROUPS.map(group => [group, { families: 0, people: 0 }])) as Record<
    ProgrammeGroup,
    GroupTally
  >
  for (const family of families) {
    if (!family.group) continue
    tally[family.group].families += 1
    tally[family.group].people += size(family)
  }
  return tally
}

/** "18 persone · 5 famiglie". */
export function tallyLabel(tally: GroupTally): string {
  return `${plural(tally.people, 'persona', 'persone')} · ${plural(tally.families, 'famiglia', 'famiglie')}`
}

/**
 * Puts the families without a group into the groups, keeping them as even as possible: the largest family
 * first goes to the group with the fewest people (then the fewest families, then Giallo, Rosso, Blu).
 * A family without cards yet counts as large as the average family. Families already in a group stay
 * where they are. Returns the group of each family placed.
 */
export function distributeFamilies<T extends Groupable & { id: string; familyName: string }>(
  families: readonly T[],
): Map<string, ProgrammeGroup> {
  const known = families.filter(family => family.members.length)
  const average = known.length
    ? Math.round(known.reduce((sum, family) => sum + family.members.length, 0) / known.length)
    : 1
  const sizeOf = (family: T) => family.members.length || average
  const tally = tallyGroups(families, sizeOf)
  const placed = new Map<string, ProgrammeGroup>()
  const waiting = families
    .filter(family => !family.group)
    .sort((a, b) => sizeOf(b) - sizeOf(a) || a.familyName.localeCompare(b.familyName, 'it'))
  for (const family of waiting) {
    const group = PROGRAMME_GROUPS.reduce((best, candidate) => {
      const a = tally[candidate]
      const b = tally[best]
      return a.people < b.people || (a.people === b.people && a.families < b.families) ? candidate : best
    })
    tally[group].families += 1
    tally[group].people += sizeOf(family)
    placed.set(family.id, group)
  }
  return placed
}

/** "Marco, 9 anni" for the young, "Grazia" for adults. */
export function memberLabel(member: GroupMember): string {
  return member.age === null ? member.name : `${member.name}, ${formatAge(member.age)}`
}
