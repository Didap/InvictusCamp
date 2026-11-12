// The activity groups of a session (docs/spec.md 3.12): the families holding a place split among the
// groups of the programme, Giallo, Rosso and Blu. Pure functions, shared by the Gruppi tab of a session
// and the CSV of its groups.
import type { GroupMember } from '../types/activity-groups'
import { PROGRAMME_GROUPS, type ProgrammeGroup } from './constants'
import { formatAge, plural } from './format'

/** Shown instead of the name of a card still to fill in. */
export const NO_NAME = 'Nome da indicare'

export interface GroupTally {
  families: number
  people: number
}

/** Families and people of each group. */
export function tallyGroups(
  families: readonly { group: ProgrammeGroup | null; members: readonly unknown[] }[],
): Record<ProgrammeGroup, GroupTally> {
  const tally = Object.fromEntries(PROGRAMME_GROUPS.map(group => [group, { families: 0, people: 0 }])) as Record<
    ProgrammeGroup,
    GroupTally
  >
  for (const family of families) {
    if (!family.group) continue
    tally[family.group].families += 1
    tally[family.group].people += family.members.length
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
 * Families already in a group stay where they are. Returns the group of each family placed.
 */
export function distributeFamilies(
  families: readonly { id: string; familyName: string; group: ProgrammeGroup | null; members: readonly unknown[] }[],
): Map<string, ProgrammeGroup> {
  const tally = tallyGroups(families)
  const placed = new Map<string, ProgrammeGroup>()
  const waiting = families
    .filter(family => !family.group)
    .sort((a, b) => b.members.length - a.members.length || a.familyName.localeCompare(b.familyName, 'it'))
  for (const family of waiting) {
    const group = PROGRAMME_GROUPS.reduce((best, candidate) => {
      const a = tally[candidate]
      const b = tally[best]
      return a.people < b.people || (a.people === b.people && a.families < b.families) ? candidate : best
    })
    tally[group].families += 1
    tally[group].people += family.members.length
    placed.set(family.id, group)
  }
  return placed
}

/** "Marco, 9 anni" for the young, "Grazia" for adults. */
export function memberLabel(member: GroupMember): string {
  const name = member.name ?? NO_NAME
  return member.age === null ? name : `${name}, ${formatAge(member.age)}`
}
