// The sums behind the Feedback page (docs/spec.md 3.13): votes per question, filtered by session, and the
// staff seen activity by activity. Pure functions over a FeedbackArchive.
import type { FeedbackArchive, FeedbackItemKind, VoteCounts } from '../types/feedback'

type Person = FeedbackArchive['staff']['people'][number]

export const emptyVotes = (): VoteCounts => ({ five: 0, four: 0, low: 0 })

export function addVotes(into: VoteCounts, votes: VoteCounts): VoteCounts {
  into.five += votes.five
  into.four += votes.four
  into.low += votes.low
  return into
}

export const votesTotal = (votes: VoteCounts) => votes.five + votes.four + votes.low

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
  const results = archive.items.map(item => ({ ...item, votes: emptyVotes() }))
  for (const [s, item, vote] of archive.votes) {
    if (session !== null && s !== session) continue
    const votes = results[item]!.votes
    if (vote === 5) votes.five++
    else if (vote === 4) votes.four++
    else votes.low++
  }
  const fiveShare = (r: ItemResult) => r.votes.five / (votesTotal(r.votes) || 1)
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

/** A turn of an activity in a session, with everyone who led it (a turn in pairs is one row). */
export interface ActivityTurn {
  session: number
  names: string[]
  votes: VoteCounts
  note: string | null
}

export interface ActivityLeads {
  activity: string
  turns: ActivityTurn[]
}

/** The note of a lead that only says who the partner was: the names of the turn already say it. */
const PAIR_NOTE = /^condotta in coppia con /

/**
 * Each activity session by session with who led it: the comparison the camp finds most useful. The votes
 * are per session and activity, so the leads of the same session are the same turn. Activities in the order
 * of the questionnaire, then any other.
 */
export function leadsByActivity(archive: FeedbackArchive): ActivityLeads[] {
  const order = archive.items.map(item => item.label)
  const byActivity = new Map<string, Map<number, ActivityTurn>>()
  for (const person of archive.staff.people) {
    for (const lead of person.leads) {
      const turns = byActivity.get(lead.activity) ?? new Map<number, ActivityTurn>()
      byActivity.set(lead.activity, turns)
      const turn = turns.get(lead.session) ?? { session: lead.session, names: [], votes: lead.votes, note: null }
      turns.set(lead.session, turn)
      turn.names.push(person.name)
      if (lead.note && !PAIR_NOTE.test(lead.note) && turn.note !== lead.note)
        turn.note = turn.note ? `${turn.note} · ${lead.note}` : lead.note
    }
  }
  const rank = (activity: string) => (order.includes(activity) ? order.indexOf(activity) : order.length)
  return [...byActivity]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'it'))
    .map(([activity, turns]) => ({
      activity,
      turns: [...turns.values()]
        .sort((a, b) => a.session - b.session)
        .map(turn => ({ ...turn, names: turn.names.sort((a, b) => a.localeCompare(b, 'it')) })),
    }))
}

/** All the votes of the activities a person led, and the activities by name. */
export function personLeads(person: Person): { votes: VoteCounts; activities: string[] } {
  return {
    votes: person.leads.reduce((sum, lead) => addVotes(sum, lead.votes), emptyVotes()),
    activities: [...new Set(person.leads.map(lead => lead.activity))],
  }
}
