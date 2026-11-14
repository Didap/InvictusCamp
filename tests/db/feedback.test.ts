// The end-of-session questionnaire (docs/spec.md 3.13): who receives it, who can answer, once, and how a
// year of answers reads in the shape of an imported one.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { familyHome } from '../../server/domain/families'
import {
  familyFeedbackForm,
  feedbackYear,
  feedbackYears,
  programmeLeads,
  sessionNumbers,
  submitFeedback,
  summariseQuestionnaire,
} from '../../server/domain/feedback'
import { familySessions, transitionSession } from '../../server/domain/sessions'
import type { EmailContext } from '../../server/emails/types'
import { FEEDBACK_OTHER_ITEMS, FEEDBACK_QUESTIONS } from '../../shared/content/feedback-form'
import type { ProgrammeContent } from '../../shared/types/domain'
import type { FeedbackArchive } from '../../shared/types/feedback'
import type { ParticipationKind, ParticipationStatus, ProgrammeGroup } from '../../shared/utils/constants'
import { makeAdmin, makeFamily, makeSession, makeUser, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx: EmailContext = { appUrl: 'http://localhost:3080' }

const WEEK: ProgrammeContent = {
  activities: ['Spiaggia', 'Piscina / Spa'],
  days: [
    {
      id: 'mon',
      name: 'Lunedì',
      subtitle: 'Arrivo',
      blocks: [
        {
          id: 'groups',
          start: '10:00',
          end: '12:00',
          title: 'Attività a gruppi',
          kind: 'groups',
          note: '',
          staffNote: '',
          lead: '',
          toConfirm: false,
          groups: {
            yellow: { activity: 'Spiaggia', lead: 'Chiara' },
            red: { activity: 'Piscina / Spa', lead: 'Chiara e Marco Bianchi' },
            blue: { activity: null, lead: '' },
          },
        },
      ],
    },
  ],
}

const ARCHIVE: FeedbackArchive = {
  sessions: [{ number: 1, respondents: 1 }],
  items: [{ label: 'Arte', kind: 'activity' }],
  votes: [[1, 0, 5]],
  themes: [],
  comments: { questions: [], items: [] },
  staff: { note: null, people: [], turns: [] },
}

/** A confirmed 2027 session with the year programme, a titolare who came and the other kinds of family. */
async function confirmedSession() {
  const admin = await makeAdmin(db)
  const actor = { userId: admin.id }
  await db.insert(t.programmes).values({ year: 2027, content: WEEK })
  const session = await makeSession(db, { status: 'confirmed' })
  const join = async (kind: ParticipationKind, status: ParticipationStatus) => {
    const made = await makeFamily(db)
    await db
      .insert(t.sessionFamilies)
      .values({ sessionId: session.id, familyId: made.family.id, kind, status, invitedAt: new Date() })
    return made
  }
  const came = await join('slot', 'confirmed')
  const declined = await join('slot', 'declined')
  const reserve = await join('reserve', 'invited')
  const chiara = await makeUser(db, { role: 'staff', firstName: 'Chiara', lastName: 'Rossi' })
  await db.insert(t.sessionStaff).values({ sessionId: session.id, userId: chiara.id, status: 'accepted' })
  return { actor, session, came, declined, reserve }
}

async function completed() {
  const setup = await confirmedSession()
  const result = await transitionSession(db, ctx, { sessionId: setup.session.id, to: 'completed', actor: setup.actor })
  return { ...setup, result }
}

const answer = (votes: Record<string, number>, answers: Record<string, string> = {}) => ({ votes, answers })

describe('opening the questionnaire', () => {
  it('reaches only the titolari who came, when the session is marked completed', async () => {
    const { result, came } = await completed()
    expect(result.emails.map(email => [email.template, email.toUserId])).toEqual([['session.feedback', came.user.id]])
    expect(result.emails[0]!.html).toContain('/famiglia/questionario/')
  })

  it('is not there before the session is completed, nor for a family that did not come', async () => {
    const { session, came, declined } = await confirmedSession()
    await expect(familyFeedbackForm(db, { familyId: came.family.id, sessionId: session.id })).rejects.toMatchObject({
      statusCode: 404,
    })
    await transitionSession(db, ctx, { sessionId: session.id, to: 'completed', actor: { userId: came.user.id } })
    await expect(familyFeedbackForm(db, { familyId: declined.family.id, sessionId: session.id })).rejects.toMatchObject(
      { statusCode: 404 },
    )
  })

  it('does not open in a year that was imported: its archive is what the administration reads', async () => {
    await db.insert(t.feedbackArchives).values({ year: 2027, data: ARCHIVE })
    const { result, session, came } = await completed()
    expect(result.emails).toEqual([])
    await expect(familyFeedbackForm(db, { familyId: came.family.id, sessionId: session.id })).rejects.toMatchObject({
      statusCode: 404,
    })
    expect((await familySessions(db, came.family.id))[0]!.feedback).toBeNull()
  })

  it('is on the family home for a while after the session closed, until it is sent', async () => {
    const { session, came, actor } = await completed()
    const home = async () =>
      (await familyHome(db, { userId: came.user.id, firstName: 'Anna', familyId: came.family.id })).openFeedback
    const closedAt = (days: number) =>
      db
        .update(t.campSessions)
        .set({ statusChangedAt: new Date(Date.now() - days * 86_400_000) })
        .where(eq(t.campSessions.id, session.id))
    expect(await home()).toEqual({ sessionId: session.id, title: session.title })
    await closedAt(31)
    expect(await home()).toBeNull()
    await closedAt(1)
    await submitFeedback(db, { familyId: came.family.id, sessionId: session.id, actor, values: answer({ Staff: 5 }) })
    expect(await home()).toBeNull()
  })

  it('asks for the activities of the session programme, then the other votes and the questions', async () => {
    const { session, came } = await completed()
    const form = await familyFeedbackForm(db, { familyId: came.family.id, sessionId: session.id })
    expect(form.items).toEqual([
      { label: 'Spiaggia', kind: 'activity' },
      { label: 'Piscina / Spa', kind: 'activity' },
      ...FEEDBACK_OTHER_ITEMS.map(label => ({ label, kind: 'other' })),
    ])
    expect(form.questions.map(q => q.id)).toEqual(FEEDBACK_QUESTIONS.map(q => q.id))
    expect(form.sentAt).toBeNull()
  })
})

describe('answering', () => {
  it('stores the answers once, and the family sees it as sent', async () => {
    const { session, came, actor } = await completed()
    const input = { familyId: came.family.id, sessionId: session.id, actor }
    expect((await familySessions(db, came.family.id))[0]!.feedback).toBe('open')

    await submitFeedback(db, { ...input, values: answer({ Spiaggia: 5, Staff: 4 }, { meaning: 'Casa', final: '' }) })
    const [row] = await db.select().from(t.feedbackResponses)
    expect(row).toMatchObject({ votes: { Spiaggia: 5, Staff: 4 }, answers: { meaning: 'Casa' } })
    expect((await familySessions(db, came.family.id))[0]!.feedback).toBe('sent')
    expect((await familyFeedbackForm(db, input)).sentAt).not.toBeNull()
    const audit = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'feedback.submit'))
    expect(audit).toHaveLength(1)

    await expect(submitFeedback(db, { ...input, values: answer({ Spiaggia: 4 }) })).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('refuses votes and answers the questionnaire does not have, and an empty one', async () => {
    const { session, came, actor } = await completed()
    const input = { familyId: came.family.id, sessionId: session.id, actor }
    for (const values of [answer({ Golf: 5 }), answer({}, { nope: 'testo' }), answer({}, { meaning: '' })]) {
      await expect(submitFeedback(db, { ...input, values })).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(await db.select().from(t.feedbackResponses)).toHaveLength(0)
  })
})

describe('reading a year', () => {
  it('sums the answers up like an imported year: numbered sessions, anonymous families, turns', async () => {
    // An earlier session of the year without answers: the completed one is S2.
    await makeSession(db, { title: 'Prima', startDate: '2027-05-31', endDate: '2027-06-06' })
    const { session, came, actor } = await completed()
    const other = await makeFamily(db)
    await db
      .insert(t.sessionFamilies)
      .values({ sessionId: session.id, familyId: other.family.id, kind: 'slot', status: 'confirmed' })
    await submitFeedback(db, {
      familyId: came.family.id,
      sessionId: session.id,
      actor,
      values: answer({ Spiaggia: 5, 'Piscina / Spa': 3, Staff: 5 }, { meaning: 'Una famiglia' }),
    })
    await submitFeedback(db, {
      familyId: other.family.id,
      sessionId: session.id,
      actor,
      values: answer({ Spiaggia: 4 }, { suggestions: 'Più spiaggia', meaning: 'Casa' }),
    })

    expect(await feedbackYears(db)).toEqual([2027])
    const year = await feedbackYear(db, 2027)
    expect(year.sessions).toEqual([{ number: 2, respondents: 2 }])
    expect(year.items).toEqual([
      { label: 'Spiaggia', kind: 'activity' },
      { label: 'Piscina / Spa', kind: 'activity' },
      { label: 'Staff', kind: 'other' },
    ])
    expect(year.votes).toEqual([
      [2, 0, 5],
      [2, 1, 3],
      [2, 2, 5],
      [2, 0, 4],
    ])
    const meaning = FEEDBACK_QUESTIONS.findIndex(q => q.id === 'meaning')
    expect(year.comments.items).toEqual([
      { session: 2, family: 1, question: meaning, text: 'Una famiglia' },
      { session: 2, family: 2, question: 0, text: 'Più spiaggia' },
      { session: 2, family: 2, question: meaning, text: 'Casa' },
    ])
    expect(year.staff.turns).toEqual([
      { session: 2, activity: 'Spiaggia', names: ['Chiara Rossi'], votes: { five: 1, four: 1, low: 0 }, note: null },
      {
        session: 2,
        activity: 'Piscina / Spa',
        names: ['Chiara Rossi', 'Marco Bianchi'],
        votes: { five: 0, four: 0, low: 1 },
        note: null,
      },
    ])
    expect(year.staff.people).toEqual([
      { name: 'Chiara Rossi', sessions: [2] },
      { name: 'Marco Bianchi', sessions: [2] },
    ])
  })

  it('reads an imported year as it is, and says when a year has nothing', async () => {
    await db.insert(t.feedbackArchives).values({ year: 2026, data: ARCHIVE })
    expect(await feedbackYear(db, 2026)).toEqual(ARCHIVE)
    expect(await feedbackYears(db)).toEqual([2026])
    await expect(feedbackYear(db, 2027)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('who led an activity', () => {
  it('splits the names and matches them to the staff by full or first name, group by group', () => {
    const staff = ['Chiara Rossi', 'Luca Verdi', 'Luca Neri']
    const week: ProgrammeContent = structuredClone(WEEK)
    week.days[0]!.blocks[0]!.groups = {
      yellow: { activity: 'Spiaggia', lead: 'chiara rossi, Luca' },
      red: { activity: 'Piscina / Spa', lead: 'Daniele / Chiara ed Elisa' },
      blue: { activity: 'Spiaggia', lead: 'Renée Bianchi' },
    }
    const leads = programmeLeads(week, staff)
    expect([...leads.keys()]).toEqual(['Spiaggia', 'Piscina / Spa'])
    expect(Object.fromEntries(leads.get('Spiaggia')!)).toEqual({
      yellow: ['Chiara Rossi', 'Luca'],
      blue: ['Renée Bianchi'],
    })
    expect(Object.fromEntries(leads.get('Piscina / Spa')!)).toEqual({ red: ['Chiara Rossi', 'Daniele', 'Elisa'] })
  })

  it('gives each person the votes of the groups they led', () => {
    const week: ProgrammeContent = structuredClone(WEEK)
    week.days[0]!.blocks[0]!.groups = {
      yellow: { activity: 'Spiaggia', lead: 'Chiara' },
      red: { activity: 'Spiaggia', lead: 'Marco' },
      blue: { activity: 'Spiaggia', lead: 'Chiara' },
    }
    const response = (group: ProgrammeGroup | null, vote: number) => ({
      sessionId: 's',
      group,
      votes: { Spiaggia: vote },
      answers: {},
    })
    const year = summariseQuestionnaire({
      sessions: [{ id: 's', number: 4, content: week, staff: ['Chiara Rossi', 'Marco Bianchi'] }],
      // A family without a group: the activity had two sets of people, it is in neither.
      responses: [response('yellow', 5), response('red', 2), response('blue', 4), response(null, 5)],
    })
    expect(year.staff.turns.map(turn => [turn.names, turn.votes])).toEqual([
      [['Chiara Rossi'], { five: 1, four: 1, low: 0 }],
      [['Marco Bianchi'], { five: 0, four: 0, low: 1 }],
    ])
  })
})

describe('session numbers', () => {
  it('come from the calendar title, the others after them in date order', () => {
    const numbers = sessionNumbers([
      { id: 'a', title: 'Sessione 3 · Weekend di primavera' },
      { id: 'b', title: 'Sessione 3 · Weekend di primavera (copia)' },
      { id: 'c', title: 'Sessione estiva' },
      { id: 'd', title: 'Sessione 5 · Luglio' },
    ])
    expect(Object.fromEntries(numbers)).toEqual({ a: 3, d: 5, b: 6, c: 7 })
  })
})
