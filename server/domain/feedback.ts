// The feedback of the families (docs/spec.md 3.13). A family that took part in a session answers the
// end-of-session questionnaire once the session is completed; the administration reads a year whole, either
// the archive of an imported year (2026) or every answer of the year summed up in the same shape, the
// families as numbers. Explicit imports only, so the database tests can load this file.
import { and, asc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm'
import { calendarNumber } from '../../shared/content/calendar-2027'
import { FEEDBACK_OTHER_ITEMS, FEEDBACK_QUESTIONS } from '../../shared/content/feedback-form'
import type { FeedbackAnswerInput } from '../../shared/schemas/feedback'
import type { ProgrammeContent } from '../../shared/types/domain'
import type { FamilyFeedbackForm, FeedbackArchive, FeedbackItem, FeedbackTurn } from '../../shared/types/feedback'
import { PROGRAMME_GROUPS, type ProgrammeGroup } from '../../shared/utils/constants'
import { countVote } from '../../shared/utils/feedback'
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
const ALREADY_SENT = 'Hai già inviato il questionario di questa sessione'

/** The home reminds a family of its questionnaire for this many days after the session is marked completed. */
export const FEEDBACK_REMINDER_DAYS = 30

const yearOf = (day: string) => Number(day.slice(0, 4))

/**
 * Where session_families meets camp_sessions: the family can answer the questionnaire of that session. A
 * titolare who came, the session completed, and its year not imported (the administration reads the archive
 * of an imported year, so answers there would never be seen).
 */
export function questionnaireOpen(): SQL {
  return and(
    eq(sessionFamilies.kind, 'slot'),
    eq(sessionFamilies.status, 'confirmed'),
    eq(campSessions.status, 'completed'),
    sql`not exists (select 1 from ${feedbackArchives} where ${feedbackArchives.year} = extract(year from ${campSessions.startDate})::int)`,
  )!
}

/** Joins a participation (session_families) and the family's answer to that session. */
export function ownResponse(): SQL {
  return and(
    eq(feedbackResponses.sessionId, sessionFamilies.sessionId),
    eq(feedbackResponses.familyId, sessionFamilies.familyId),
  )!
}

/** A session of an imported year gets no questionnaire (questionnaireOpen). */
export async function isYearArchived(db: DbOrTx, startDate: string): Promise<boolean> {
  const rows = await db
    .select({ year: feedbackArchives.year })
    .from(feedbackArchives)
    .where(eq(feedbackArchives.year, yearOf(startDate)))
    .limit(1)
  return rows.length > 0
}

/** The votes of a session: the activities of its programme, then reception, spaces and staff. */
function feedbackItems(content: ProgrammeContent | null): FeedbackItem[] {
  const activities = content?.activities ?? []
  return [
    ...activities.map(label => ({ label, kind: 'activity' as const })),
    ...FEEDBACK_OTHER_ITEMS.filter(label => !activities.includes(label)).map(label => ({
      label,
      kind: 'other' as const,
    })),
  ]
}

// ─── The family ────────────────────────────────────────────────────────────────────────────────────

async function requireQuestionnaire(db: DbOrTx, input: { familyId: string; sessionId: string }) {
  // The programme of a completed session is its copy, fixed when it closed (freezeSessionProgramme).
  const [row] = await db
    .select({
      id: campSessions.id,
      title: campSessions.title,
      startDate: campSessions.startDate,
      endDate: campSessions.endDate,
      sentAt: feedbackResponses.createdAt,
      content: programmes.content,
    })
    .from(sessionFamilies)
    .innerJoin(campSessions, eq(campSessions.id, sessionFamilies.sessionId))
    .leftJoin(feedbackResponses, ownResponse())
    .leftJoin(programmes, eq(programmes.sessionId, campSessions.id))
    .where(
      and(
        eq(sessionFamilies.familyId, input.familyId),
        eq(sessionFamilies.sessionId, input.sessionId),
        questionnaireOpen(),
      ),
    )
    .limit(1)
  if (!row) throw new DomainError(404, NOT_AVAILABLE)
  const { content, ...questionnaire } = row
  return { ...questionnaire, items: feedbackItems(content) }
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
  const { votes } = input.values
  const questionnaire = await requireQuestionnaire(db, input)
  if (questionnaire.sentAt) throw new DomainError(409, ALREADY_SENT)

  const labels = new Set(questionnaire.items.map(item => item.label))
  const unknownVote = Object.keys(votes).find(label => !labels.has(label))
  if (unknownVote) throw new DomainError(400, `«${unknownVote}» non è tra i voti del questionario`)
  const ids = new Set(FEEDBACK_QUESTIONS.map(question => question.id))
  const answers = Object.fromEntries(Object.entries(input.values.answers).filter(([, text]) => text))
  if (Object.keys(answers).some(id => !ids.has(id))) {
    throw new DomainError(400, 'Una risposta non è tra le domande del questionario')
  }
  if (!Object.keys(votes).length && !Object.keys(answers).length) {
    throw new DomainError(400, 'Dai almeno un voto o scrivi una risposta')
  }

  const inserted = await db
    .insert(feedbackResponses)
    .values({ sessionId: input.sessionId, familyId: input.familyId, votes, answers })
    .onConflictDoNothing()
    .returning({ id: feedbackResponses.id })
  if (!inserted.length) throw new DomainError(409, ALREADY_SENT)
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

/** The years with feedback, newest first: the imported ones and the ones with answers to the questionnaire. */
export async function feedbackYears(db: DbOrTx): Promise<number[]> {
  const [archived, answered] = await Promise.all([
    db.select({ year: feedbackArchives.year }).from(feedbackArchives),
    db
      .selectDistinct({ startDate: campSessions.startDate })
      .from(feedbackResponses)
      .innerJoin(campSessions, eq(campSessions.id, feedbackResponses.sessionId)),
  ])
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
  const ofYear = and(gte(campSessions.startDate, `${year}-01-01`), lt(campSessions.startDate, `${year + 1}-01-01`))
  const [sessions, responses] = await Promise.all([
    db
      .select({ id: campSessions.id, title: campSessions.title })
      .from(campSessions)
      .where(ofYear)
      .orderBy(asc(campSessions.startDate), asc(campSessions.createdAt)),
    db
      .select({
        sessionId: feedbackResponses.sessionId,
        group: sessionFamilies.activityGroup,
        votes: feedbackResponses.votes,
        answers: feedbackResponses.answers,
      })
      .from(feedbackResponses)
      .innerJoin(campSessions, eq(campSessions.id, feedbackResponses.sessionId))
      .leftJoin(sessionFamilies, ownResponse())
      .where(ofYear)
      .orderBy(asc(feedbackResponses.createdAt), asc(feedbackResponses.id)),
  ])
  if (!responses.length) return null

  const answered = new Set(responses.map(r => r.sessionId))
  const [contents, staff] = await Promise.all([
    db
      .select({ sessionId: programmes.sessionId, content: programmes.content })
      .from(programmes)
      .where(inArray(programmes.sessionId, [...answered])),
    db
      .select({ sessionId: sessionStaff.sessionId, firstName: users.firstName, lastName: users.lastName })
      .from(sessionStaff)
      .innerJoin(users, eq(users.id, sessionStaff.userId))
      .where(and(inArray(sessionStaff.sessionId, [...answered]), eq(sessionStaff.status, 'accepted'))),
  ])
  const contentOf = new Map(contents.map(row => [row.sessionId, row.content]))
  const staffOf = Map.groupBy(staff, row => row.sessionId)
  const numbers = sessionNumbers(sessions)
  return summariseQuestionnaire({
    sessions: sessions
      .filter(s => answered.has(s.id))
      .map(s => ({
        id: s.id,
        number: numbers.get(s.id)!,
        content: contentOf.get(s.id) ?? null,
        staff: staffOf.get(s.id)?.map(fullName) ?? [],
      })),
    responses,
  })
}

/**
 * S1, S2…: the number the calendar puts in the title (calendarNumber), so that it does not move when sessions
 * are added, copied or deleted. A session without one, or with a number taken by an earlier session, comes
 * after the others, in start date order (the order of `sessions`).
 */
export function sessionNumbers(sessions: { id: string; title: string }[]): Map<string, number> {
  const numbers = new Map<string, number>()
  const taken = new Set<number>()
  const rest: string[] = []
  for (const s of sessions) {
    const number = calendarNumber(s.title)
    if (number && !taken.has(number)) {
      numbers.set(s.id, number)
      taken.add(number)
    } else rest.push(s.id)
  }
  let next = Math.max(0, ...taken)
  for (const id of rest) numbers.set(id, ++next)
  return numbers
}

interface QuestionnaireSession {
  id: string
  number: number
  /** The programme of the session (its copy), for the activities and who led them. */
  content: ProgrammeContent | null
  /** The full names of the staff who accepted the convocation. */
  staff: string[]
}

interface QuestionnaireResponse {
  sessionId: string
  /** The family's activity group in the session: whose turn its votes go to. */
  group: ProgrammeGroup | null
  votes: Record<string, number>
  answers: Record<string, string>
}

/**
 * The answers of a year in the shape of an imported one (FeedbackArchive). The staff part is made of turns:
 * an activity in a session, the people the programme names as leading it for some groups, and the votes of
 * the families of those groups. A family without a group counts only when everyone did the activity with
 * the same people.
 */
export function summariseQuestionnaire(input: {
  sessions: QuestionnaireSession[]
  responses: QuestionnaireResponse[]
}): FeedbackArchive {
  const bySession = Map.groupBy(input.responses, response => response.sessionId)

  // The questions with at least one vote: activities in programme order, then the others.
  const voted = new Set(input.responses.flatMap(r => Object.keys(r.votes)))
  const items: FeedbackItem[] = []
  const addItem = (label: string, kind: FeedbackItem['kind']) => {
    if (voted.has(label) && !items.some(item => item.label === label)) items.push({ label, kind })
  }
  for (const s of input.sessions) for (const label of s.content?.activities ?? []) addItem(label, 'activity')
  for (const label of [...FEEDBACK_OTHER_ITEMS, ...voted]) addItem(label, 'other')

  const votes: FeedbackArchive['votes'] = []
  const comments: FeedbackArchive['comments']['items'] = []
  const people = new Map<string, Set<number>>()
  const turns: FeedbackTurn[] = []
  const addPerson = (name: string, session: number) => people.set(name, (people.get(name) ?? new Set()).add(session))

  for (const s of input.sessions) {
    const responses = bySession.get(s.id) ?? []
    responses.forEach((response, index) => {
      // In the order of the questions: jsonb keeps its keys in an order of its own.
      items.forEach(({ label }, item) => {
        const vote = response.votes[label]
        if (vote) votes.push([s.number, item, vote])
      })
      FEEDBACK_QUESTIONS.forEach((question, q) => {
        const text = response.answers[question.id]?.trim()
        if (text) comments.push({ session: s.number, family: index + 1, question: q, text })
      })
    })

    for (const name of s.staff) addPerson(name, s.number)
    for (const [activity, byGroup] of programmeLeads(s.content, s.staff)) {
      // One turn per set of people, with the groups they led through the activity.
      const sets = [...Map.groupBy(byGroup, ([, names]) => names.join('\n')).values()]
      for (const set of sets) {
        const names = set[0]![1]
        const groups = set.map(([group]) => group)
        const counts = { five: 0, four: 0, low: 0 }
        for (const response of responses) {
          const vote = response.votes[activity]
          const theirs = response.group ? groups.includes(response.group) : sets.length === 1
          if (vote && theirs) countVote(counts, vote)
        }
        for (const name of names) addPerson(name, s.number)
        turns.push({ session: s.number, activity, names, votes: counts, note: null })
      }
    }
  }

  return {
    sessions: input.sessions.map(s => ({ number: s.number, respondents: bySession.get(s.id)?.length ?? 0 })),
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

/** "Chiara, Marco", "Chiara e Marco", "Chiara ed Elisa", "Chiara / Marco": the people of one lead. */
const LEAD_SEPARATOR = /\s*[,;/&+]\s*|\s+(?:e|ed)\s+/i

/**
 * Who led each activity of a programme for each group, from the turns of its group blocks, in the order the
 * activities come in the week; names in alphabetical order. A name is matched to the session's staff by full
 * name or, when only one person has it, by first name; otherwise it stays as written. Activities and groups
 * nobody is named for are left out.
 */
export function programmeLeads(
  content: ProgrammeContent | null,
  staff: string[],
): Map<string, Map<ProgrammeGroup, string[]>> {
  const known = staff.map(full => ({ full, lower: full.toLocaleLowerCase('it') }))
  const staffName = (name: string) => {
    const lower = name.toLocaleLowerCase('it')
    const exact = known.find(person => person.lower === lower)
    if (exact) return exact.full
    const byFirst = known.filter(person => person.lower.split(' ')[0] === lower)
    return byFirst.length === 1 ? byFirst[0]!.full : name
  }

  const leads = new Map<string, Map<ProgrammeGroup, Set<string>>>()
  for (const day of content?.days ?? []) {
    for (const block of day.blocks) {
      for (const group of PROGRAMME_GROUPS) {
        const turn = block.groups?.[group]
        const activity = turn?.activity?.trim()
        if (!turn || !activity) continue
        const names = turn.lead
          .split(LEAD_SEPARATOR)
          .map(name => name.trim())
          .filter(Boolean)
        if (!names.length) continue
        const byGroup = leads.get(activity) ?? new Map<ProgrammeGroup, Set<string>>()
        const set = byGroup.get(group) ?? new Set<string>()
        for (const name of names) set.add(staffName(name))
        leads.set(activity, byGroup.set(group, set))
      }
    }
  }
  return new Map(
    [...leads].map(([activity, byGroup]) => [
      activity,
      new Map([...byGroup].map(([group, names]) => [group, [...names].sort((a, b) => a.localeCompare(b, 'it'))])),
    ]),
  )
}
