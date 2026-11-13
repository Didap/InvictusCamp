// The sums behind the Feedback page (docs/spec.md 3.13): votes per question, filtered by session, and the
// turns of the staff by activity or by person. Pure functions over a FeedbackArchive.
//
// Type imports only: scripts/import-feedback.mjs loads this file with Node's type stripping.
import type { FeedbackArchive, FeedbackItemKind, FeedbackTurn, VoteCounts } from '../types/feedback'

/**
 * The three levels the page shows, in order: label and swatch (FeedbackVoteBar, FeedbackVoteLegend). 5 solid,
 * 4 lighter, 1-3 in the warning colour so the low votes stand out.
 */
export const VOTE_LEVELS = [
  { key: 'five', short: '5', label: 'Voto 5', swatch: 'bg-primary' },
  { key: 'four', short: '4', label: 'Voto 4', swatch: 'bg-primary/45' },
  { key: 'low', short: 'da 1 a 3', label: 'Da 1 a 3', swatch: 'bg-warning' },
] as const satisfies readonly { key: keyof VoteCounts; short: string; label: string; swatch: string }[]

export const votesTotal = (votes: VoteCounts) => votes.five + votes.four + votes.low

/** Adds a vote from 1 to 5 to its share: 5, 4, or 1-3. */
export function countVote(votes: VoteCounts, vote: number): void {
  if (vote === 5) votes.five++
  else if (vote === 4) votes.four++
  else votes.low++
}

/** Whole percentages of 5, 4 and 1-3 (0 without votes). */
export function voteShares(votes: VoteCounts): VoteCounts {
  const total = votesTotal(votes)
  const share = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  return { five: share(votes.five), four: share(votes.four), low: share(votes.low) }
}

export interface ItemResult {
  label: string
  kind: FeedbackItemKind
  votes: VoteCounts
}

/** Votes of every question in one session (or all, with null), the most liked first. */
export function itemResults(archive: FeedbackArchive, session: number | null): ItemResult[] {
  const results = archive.items.map(item => ({ ...item, votes: { five: 0, four: 0, low: 0 } }))
  for (const [s, item, vote] of archive.votes) {
    if (session !== null && s !== session) continue
    countVote(results[item]!.votes, vote)
  }
  const fiveShare = (r: ItemResult) => r.votes.five / votesTotal(r.votes)
  return results
    .filter(r => votesTotal(r.votes) > 0)
    .sort((a, b) => fiveShare(b) - fiveShare(a) || votesTotal(b.votes) - votesTotal(a.votes))
}

export function respondents(archive: FeedbackArchive, session: number | null): number {
  return archive.sessions.reduce((sum, s) => (session === null || s.number === session ? sum + s.respondents : sum), 0)
}

/** "Sessione 1", "Sessione 2"… after "Tutte le sessioni" (value 'all'), for the filters of the page. */
export function sessionOptions(archive: FeedbackArchive): { label: string; value: string }[] {
  return [
    { label: 'Tutte le sessioni', value: 'all' },
    ...archive.sessions.map(s => ({ label: `Sessione ${s.number}`, value: String(s.number) })),
  ]
}

export interface ActivityTurns {
  activity: string
  turns: FeedbackTurn[]
}

/**
 * Each activity session by session with who led it: the comparison the camp finds most useful. Activities
 * in the order of the questionnaire, then any other.
 */
export function turnsByActivity(archive: FeedbackArchive): ActivityTurns[] {
  const order = archive.items.map(item => item.label)
  const rank = (activity: string) => {
    const i = order.indexOf(activity)
    return i < 0 ? order.length : i
  }
  const byActivity = new Map<string, FeedbackTurn[]>()
  for (const turn of archive.staff.turns)
    byActivity.set(turn.activity, [...(byActivity.get(turn.activity) ?? []), turn])
  return [...byActivity]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'it'))
    .map(([activity, turns]) => ({ activity, turns: turns.sort((a, b) => a.session - b.session) }))
}

/** The turns a person led, all their votes together and the activities by name. */
export function personTurns(archive: FeedbackArchive, name: string) {
  const turns = archive.staff.turns.filter(turn => turn.names.includes(name)).sort((a, b) => a.session - b.session)
  const votes = { five: 0, four: 0, low: 0 }
  for (const turn of turns) {
    votes.five += turn.votes.five
    votes.four += turn.votes.four
    votes.low += turn.votes.low
  }
  return { turns, votes, activities: [...new Set(turns.map(turn => turn.activity))] }
}
