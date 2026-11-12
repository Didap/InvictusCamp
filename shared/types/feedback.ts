// What the families said at the end of their session (docs/spec.md 3.13). A year imported from outside (the
// 2026 pages of Nicola) is kept whole in feedback_archives.data with this shape.

/** Votes from 1 to 5, as the pages show them: how many 5, how many 4, how many from 1 to 3. */
export interface VoteCounts {
  five: number
  four: number
  low: number
}

export type FeedbackItemKind = 'activity' | 'other'

export interface FeedbackArchive {
  /** The sessions of the year by number (S1, S2…) and how many families answered. */
  sessions: { number: number; respondents: number }[]
  /** The questions with a vote: the activities, then reception, spaces and staff. */
  items: { label: string; kind: FeedbackItemKind }[]
  /** One vote of a family: session number, index in `items`, vote from 1 to 5. */
  votes: [session: number, item: number, vote: number][]
  /** Suggestions that came back from several families, as the camp summed them up. */
  themes: { title: string; families: number; sessions: number[]; detail: string }[]
  /** The written answers: anonymous, a family is a number within its session. */
  comments: {
    questions: string[]
    items: { session: number; family: number; question: number; text: string }[]
  }
  /** Administration only: names, presences and the votes of the activities each person led. */
  staff: {
    /** Who is left out of the counts, as the source says it. */
    note: string | null
    people: {
      name: string
      sessions: number[]
      leads: { session: number; activity: string; votes: VoteCounts; note: string | null }[]
    }[]
  }
}

/** GET /api/admin/feedback: the years there are, newest first. */
export interface FeedbackYear {
  year: number
  source: string | null
  importedAt: string
}
