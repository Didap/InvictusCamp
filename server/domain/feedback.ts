// The feedback of the families (docs/spec.md 3.13). A family that took part in a session answers the
// end-of-session questionnaire once the session is completed; the administration reads a year whole, either
// the archive of an imported year (2026) or every answer of the year summed up in the same shape, the
// families as numbers. Explicit imports only, so the database tests can load this file.
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import { FEEDBACK_OTHER_ITEMS, FEEDBACK_QUESTIONS } from '../../shared/content/feedback-form'
import type { FeedbackAnswerInput } from '../../shared/schemas/feedback'
import type { ProgrammeContent } from '../../shared/types/domain'
import type {
  FamilyFeedbackForm,
  FeedbackArchive,
  FeedbackItemKind,
  FeedbackState,
  FeedbackTurn,
  VoteCounts,
} from '../../shared/types/feedback'
import {
  PROGRAMME_GROUPS,
  type ParticipationKind,
  type ParticipationStatus,
  type SessionStatus,
} from '../../shared/utils/constants'
import { fullName } from '../../shared/utils/format'
import {
  campSessions,
  feedbackArchives,
  feedbackResponses,
  programmes,
  sessionFamilies,
  sessionStaff,
  users,
} from '../db/schema'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import type { Actor } from './families'

const NOT_AVAILABLE = 'Questionario non disponibile'

/** The questionnaire is there for a titolare who confirmed, once the session is completed. */
export function feedbackState(
  sessionStatus: SessionStatus,
  participation: { kind: ParticipationKind; status: ParticipationStatus },
  sent: boolean,
): FeedbackState {
  if (sessionStatus !== 'completed' || participation.kind !== 'slot' || participation.status !== 'confirmed') {
    return null
  }
  return sent ? 'sent' : 'open'
}

/** The votes of a session: the activities of its programme, then reception, spaces and staff. */
export function feedbackItems(content: ProgrammeContent | null): { label: string; kind: FeedbackItemKind }[] {
  const activities = [...new Set((content?.activities ?? []).map(label => label.trim()).filter(Boolean))]
  return [
    ...activities.map(label => ({ label, kind: 'activity' as const })),
    ...FEEDBACK_OTHER_ITEMS.filter(label => !activities.includes(label)).map(label => ({
      label,
      kind: 'other' as const,
    })),
  ]
}

/** The programmes of completed sessions: their copies, fixed when they closed (freezeSessionProgramme). */
async function sessionProgrammes(db: DbOrTx, sessionIds: string[]): Promise<Map<string, ProgrammeContent>> {
  if (!sessionIds.length) return new Map()
  const rows = await db
    .select({ sessionId: programmes.sessionId, content: programmes.content })
    .from(programmes)
    .where(inArray(programmes.sessionId, sessionIds))
  return new Map(rows.map(row => [row.sessionId!, row.content]))
}

// ─── The family ────────────────────────────────────────────────────────────────────────────────────

async function requireQuestionnaire(db: DbOrTx, input: { familyId: string; sessionId: string }) {
  const [row] = await db
    .select({
      id: campSessions.id,
      title: campSessions.title,
      startDate: campSessions.startDate,
      endDate: campSessions.endDate,
      status: campSessions.status,
      kind: sessionFamilies.kind,
      participation: sessionFamilies.status,
      sentAt: feedbackResponses.createdAt,
    })
    .from(sessionFamilies)
    .innerJoin(campSessions, eq(campSessions.id, sessionFamilies.sessionId))
    .leftJoin(
      feedbackResponses,
      and(
        eq(feedbackResponses.sessionId, sessionFamilies.sessionId),
        eq(feedbackResponses.familyId, sessionFamilies.familyId),
      ),
    )
    .where(and(eq(sessionFamilies.familyId, input.familyId), eq(sessionFamilies.sessionId, input.sessionId)))
    .limit(1)
  if (!row || !feedbackState(row.status, { kind: row.kind, status: row.participation }, false)) {
    throw new DomainError(404, NOT_AVAILABLE)
  }
  const content = (await sessionProgrammes(db, [row.id])).get(row.id) ?? null
  return { ...row, items: feedbackItems(content) }
}

export async function familyFeedbackForm(
  db: DbOrTx,
  input: { familyId: string; sessionId: string },
): Promise<FamilyFeedbackForm> {
  const { id, title, startDate, endDate, items, sentAt } = await requireQuestionnaire(db, input)
  return {
    session: { id, title, startDate, endDate },
    items,
    questions: FEEDBACK_QUESTIONS.map(({ id, prompt }) => ({ id, prompt })),
    sentAt: sentAt?.toISOString() ?? null,
  }
}

/** The family sends its answers, once: every vote and answer must be one of the session's questionnaire. */
export async function submitFeedback(
  db: DbOrTx,
  input: { familyId: string; sessionId: string; values: FeedbackAnswerInput; actor: Actor },
): Promise<void> {
  const questionnaire = await requireQuestionnaire(db, input)
  if (questionnaire.sentAt) throw new DomainError(409, 'Hai già inviato il questionario di questa sessione')

  const labels = new Set(questionnaire.items.map(item => item.label))
  const unknownVote = Object.keys(input.values.votes).find(label => !labels.has(label))
  if (unknownVote) throw new DomainError(400, `«${unknownVote}» non è tra i voti del questionario`)
  const ids = new Set(FEEDBACK_QUESTIONS.map(question => question.id))
  const answers = Object.fromEntries(Object.entries(input.values.answers).filter(([, text]) => text))
  if (Object.keys(answers).some(id => !ids.has(id))) {
    throw new DomainError(400, 'Una risposta non è tra le domande del questionario')
  }
  const votes = input.values.votes
  if (!Object.keys(votes).length && !Object.keys(answers).length) {
    throw new DomainError(400, 'Dai almeno un voto o scrivi una risposta')
  }

  const inserted = await db
    .insert(feedbackResponses)
    .values({ sessionId: input.sessionId, familyId: input.familyId, votes, answers })
    .onConflictDoNothing()
    .returning({ id: feedbackResponses.id })
  if (!inserted.length) throw new DomainError(409, 'Hai già inviato il questionario di questa sessione')
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'feedback.submit',
    entityType: 'session',
    entityId: input.sessionId,
    data: { votes: Object.keys(votes).length, answers: Object.keys(answers).length },
    ip: input.actor.ip,
  })
}

// ─── The administration ────────────────────────────────────────────────────────────────────────────

const yearOf = (day: string) => Number(day.slice(0, 4))

/** The years with feedback, newest first: the imported ones and the ones with answers to the questionnaire. */
export async function feedbackYears(db: DbOrTx): Promise<number[]> {
  const archived = await db.select({ year: feedbackArchives.year }).from(feedbackArchives)
  const answered = await db
    .selectDistinct({ startDate: campSessions.startDate })
    .from(feedbackResponses)
    .innerJoin(campSessions, eq(campSessions.id, feedbackResponses.sessionId))
  const years = new Set([...archived.map(row => row.year), ...answered.map(row => yearOf(row.startDate))])
  return [...years].sort((a, b) => b - a)
}

/** A year whole: its archive if it was imported, else the answers to the questionnaire summed up. */
export async function feedbackYear(db: DbOrTx, year: number): Promise<FeedbackArchive> {
  const [archived] = await db
    .select({ data: feedbackArchives.data })
    .from(feedbackArchives)
    .where(eq(feedbackArchives.year, year))
  if (archived) return archived.data
  const summed = await questionnaireYear(db, year)
  if (!summed) throw new DomainError(404, `Nessun feedback per il ${year}`)
  return summed
}

async function questionnaireYear(db: DbOrTx, year: number): Promise<FeedbackArchive | null> {
  // Numbered by start date among every session of the year, as the calendar names them (S1, S2…).
  const sessions = await db
    .select({ id: campSessions.id })
    .from(campSessions)
    .where(and(gte(campSessions.startDate, `${year}-01-01`), lt(campSessions.startDate, `${year + 1}-01-01`)))
    .orderBy(asc(campSessions.startDate), asc(campSessions.createdAt))
  if (!sessions.length) return null
  const responses = await db
    .select({
      sessionId: feedbackResponses.sessionId,
      votes: feedbackResponses.votes,
      answers: feedbackResponses.answers,
    })
    .from(feedbackResponses)
    .where(
      inArray(
        feedbackResponses.sessionId,
        sessions.map(s => s.id),
      ),
    )
    .orderBy(asc(feedbackResponses.createdAt), asc(feedbackResponses.id))
  if (!responses.length) return null

  const answered = sessions.filter(s => responses.some(r => r.sessionId === s.id)).map(s => s.id)
  const contents = await sessionProgrammes(db, answered)
  const staff = await db
    .select({ sessionId: sessionStaff.sessionId, firstName: users.firstName, lastName: users.lastName })
    .from(sessionStaff)
    .innerJoin(users, eq(users.id, sessionStaff.userId))
    .where(and(inArray(sessionStaff.sessionId, answered), eq(sessionStaff.status, 'accepted')))
  return summariseQuestionnaire({
    sessions: sessions
      .map((s, index) => ({
        id: s.id,
        number: index + 1,
        content: contents.get(s.id) ?? null,
        staff: staff.filter(row => row.sessionId === s.id).map(fullName),
      }))
      .filter(s => answered.includes(s.id)),
    responses,
  })
}

export interface QuestionnaireSession {
  id: string
  /** S1, S2…: its place among the sessions of the year by start date. */
  number: number
  /** The programme of the session (its copy), for the activities and who led them. */
  content: ProgrammeContent | null
  /** The full names of the staff who accepted the convocation. */
  staff: string[]
}

export interface QuestionnaireResponse {
  sessionId: string
  votes: Record<string, number>
  answers: Record<string, string>
}

/**
 * The answers of a year in the shape of an imported one (FeedbackArchive). The staff part is made of turns:
 * an activity in a session, the people the programme names as leading it in its group blocks, and every vote
 * of that activity in that session.
 */
export function summariseQuestionnaire(input: {
  sessions: QuestionnaireSession[]
  responses: QuestionnaireResponse[]
}): FeedbackArchive {
  const numberOf = new Map(input.sessions.map(s => [s.id, s.number]))
  const responses = input.responses.filter(r => numberOf.has(r.sessionId))

  // The questions with at least one vote: activities in programme order, then the others.
  const voted = new Set(responses.flatMap(r => Object.keys(r.votes)))
  const items: FeedbackArchive['items'] = []
  const added = new Set<string>()
  const addItem = (label: string, kind: FeedbackItemKind) => {
    if (added.has(label) || !voted.has(label)) return
    added.add(label)
    items.push({ label, kind })
  }
  for (const s of input.sessions) {
    for (const item of feedbackItems(s.content)) if (item.kind === 'activity') addItem(item.label, 'activity')
  }
  for (const label of [...FEEDBACK_OTHER_ITEMS, ...voted]) addItem(label, 'other')

  const votes: FeedbackArchive['votes'] = []
  const families = new Map<string, number>()
  const comments: FeedbackArchive['comments']['items'] = []
  for (const response of responses) {
    const session = numberOf.get(response.sessionId)!
    // In the order of the questions: jsonb keeps its keys in an order of its own.
    items.forEach(({ label }, index) => {
      const vote = response.votes[label]
      if (vote) votes.push([session, index, vote])
    })
    const family = (families.get(response.sessionId) ?? 0) + 1
    families.set(response.sessionId, family)
    FEEDBACK_QUESTIONS.forEach((question, index) => {
      const text = response.answers[question.id]?.trim()
      if (text) comments.push({ session, family, question: index, text })
    })
  }

  const people = new Map<string, Set<number>>()
  const turns: FeedbackTurn[] = []
  for (const s of input.sessions) {
    for (const name of s.staff) addSession(people, name, s.number)
    for (const [activity, names] of programmeLeads(s.content, s.staff)) {
      const sessionVotes = responses.filter(r => r.sessionId === s.id).map(r => r.votes[activity])
      for (const name of names) addSession(people, name, s.number)
      turns.push({ session: s.number, activity, names, votes: voteCounts(sessionVotes), note: null })
    }
  }

  return {
    sessions: input.sessions.map(s => ({ number: s.number, respondents: families.get(s.id) ?? 0 })),
    items,
    votes,
    themes: [],
    comments: { questions: FEEDBACK_QUESTIONS.map(question => question.title), items: comments },
    staff: {
      note: null,
      people: [...people].map(([name, sessions]) => ({ name, sessions: [...sessions].sort((a, b) => a - b) })),
      turns,
    },
  }
}

function addSession(people: Map<string, Set<number>>, name: string, session: number) {
  const sessions = people.get(name) ?? new Set<number>()
  sessions.add(session)
  people.set(name, sessions)
}

function voteCounts(votes: (number | undefined)[]): VoteCounts {
  const counts = { five: 0, four: 0, low: 0 }
  for (const vote of votes) {
    if (vote === 5) counts.five++
    else if (vote === 4) counts.four++
    else if (vote) counts.low++
  }
  return counts
}

/**
 * Who led each activity of a programme, from the turns of its group blocks: "Chiara, Marco" or "Chiara e
 * Marco" are two people. A name is matched to the session's staff by full name or, when only one person
 * has it, by first name; otherwise it stays as written. Activities nobody is named for are left out.
 */
export function programmeLeads(content: ProgrammeContent | null, staff: string[]): Map<string, string[]> {
  const leads = new Map<string, Set<string>>()
  for (const day of content?.days ?? []) {
    for (const block of day.blocks) {
      for (const group of PROGRAMME_GROUPS) {
        const turn = block.groups?.[group]
        const activity = turn?.activity?.trim()
        if (!turn || !activity) continue
        for (const raw of turn.lead.split(/\s*(?:[,;/&+]|\be\b)\s*/i)) {
          const name = raw.trim()
          if (!name) continue
          const names = leads.get(activity) ?? new Set<string>()
          names.add(staffName(name, staff))
          leads.set(activity, names)
        }
      }
    }
  }
  // In the order of the programme's activities: jsonb keeps the groups in an order of its own.
  const order = (activity: string) => {
    const index = content?.activities.indexOf(activity) ?? -1
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }
  return new Map([...leads].sort(([a], [b]) => order(a) - order(b)).map(([activity, names]) => [activity, [...names]]))
}

function staffName(name: string, staff: string[]): string {
  const lower = name.toLocaleLowerCase('it')
  const exact = staff.find(full => full.toLocaleLowerCase('it') === lower)
  if (exact) return exact
  const byFirst = staff.filter(full => full.toLocaleLowerCase('it').split(' ')[0] === lower)
  return byFirst.length === 1 ? byFirst[0]! : name
}
