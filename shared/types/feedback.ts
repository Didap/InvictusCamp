// What the families said at the end of their session (docs/spec.md 3.13). A year imported from outside (the
// 2026 pages of Nicola) is kept whole in feedback_archives.data with this shape.

/** Votes from 1 to 5, as the pages show them: how many 5, how many 4, how many from 1 to 3. */
export interface VoteCounts {
  five: number
  four: number
  low: number
}

export type FeedbackItemKind = 'activity' | 'other'

/** A question with a vote: an activity, or reception, spaces, staff. */
export interface FeedbackItem {
  label: string
  kind: FeedbackItemKind
}

export interface FeedbackArchive {
  /** The sessions of the year by number (S1, S2…) and how many families answered. */
  sessions: { number: number; respondents: number }[]
  /** The questions with a vote: the activities, then reception, spaces and staff. */
  items: FeedbackItem[]
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
    /** Everyone of the staff and the sessions they were in. */
    people: { name: string; sessions: number[] }[]
    /** One activity in one session: who led it (two names for a turn in pairs) and how the families voted it. */
    turns: FeedbackTurn[]
  }
}

export interface FeedbackTurn {
  session: number
  activity: string
  names: string[]
  votes: VoteCounts
  note: string | null
}

/** Where a family is with the questionnaire of a session: none (not open to it), open, or sent. */
export type FeedbackState = 'open' | 'sent' | null

/** GET /api/family/feedback/:sessionId: the questionnaire of a completed session, to fill in or sent. */
export interface FamilyFeedbackForm {
  session: { id: string; title: string; startDate: string; endDate: string }
  /** The votes: the activities of the session's programme, then reception, spaces and staff. */
  items: FeedbackItem[]
  /** The written questions, as the family reads them. */
  questions: { id: string; prompt: string }[]
  /** When the family sent it; null while it is still to fill in. */
  sentAt: string | null
}
