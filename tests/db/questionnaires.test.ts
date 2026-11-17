// The questionnaire «Dati della famiglia» against a real database: the form of the code until the first
// save, the revision that stops two people overwriting each other, the questions the code reads, types
// that stay, renamed options rewriting the answers, questions taken out keeping their answers, and a new
// required question for a family that had already confirmed.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { familyHome, saveFamilyData } from '../../server/domain/families'
import { getFamilyForm, saveFamilyForm } from '../../server/domain/questionnaires'
import { DEFAULT_FAMILY_FORM, formQuestions, type FormSection } from '../../shared/content/family-form'
import type { FamilyDataInput } from '../../shared/schemas/families'
import { familyFormSaveSchema, type OptionRename } from '../../shared/schemas/questionnaires'
import { makeAdmin, makeFamily, t, useTestDb } from './helpers'

const db = useTestDb()

const WEEKEND = 'Sessioni nel weekend (2 notti)'
const WEEK = 'Sessioni settimanali estive (4 notti)'
const ANSWERS = {
  howDidYouHear: 'Passaparola',
  association: 'Associazione Insieme',
  sessionPreferences: [WEEK, WEEKEND],
  dog: false,
  photoConsent: true,
  publicationConsent: false,
}

const familyData = (answers: FamilyDataInput['answers'] = ANSWERS): FamilyDataInput => ({
  name: 'Famiglia Prova',
  address: 'Via Roma 1',
  city: 'Taranto',
  postalCode: '74121',
  province: 'TA',
  region: 'Puglia',
  phone: '',
  composition: { adults: 1, youngWithCondition: 0, youngWithoutCondition: 1 },
  guestNames: [],
  healthConsent: false,
  answers,
})

/** The starting form, to change in a test. */
const sections = (): FormSection[] => structuredClone(DEFAULT_FAMILY_FORM.sections)
const question = (form: FormSection[], id: string) => formQuestions(form).find(item => item.id === id)!

async function save(form: FormSection[], revision: number, renames: OptionRename[] = []) {
  const admin = await makeAdmin(db)
  const values = familyFormSaveSchema.parse({ revision, sections: form, renames })
  return saveFamilyForm(db, { values, actor: { userId: admin.id, ip: null } })
}

async function confirmedFamily() {
  const { user, family } = await makeFamily(db)
  await saveFamilyData(db, { familyId: family.id, data: familyData(), actor: { userId: user.id, ip: null } })
  return { user, family }
}

const answersOf = async (familyId: string) =>
  (await db.select().from(t.families).where(eq(t.families.id, familyId)))[0]!.formAnswers

describe('family form', () => {
  it('is the form of the code until the first save, then the saved one with its revision', async () => {
    expect(await getFamilyForm(db)).toMatchObject({ revision: 0, updatedAt: null, content: DEFAULT_FAMILY_FORM })

    const form = sections()
    question(form, 'dog').label = 'Viaggiate con un cane?'
    const { form: saved } = await save(form, 0)
    expect(saved).toMatchObject({ revision: 1, updatedByName: 'Giulia Conte' })
    expect(question(saved.content.sections, 'dog').label).toBe('Viaggiate con un cane?')

    // Saved by someone else meanwhile: the old revision is refused, the first save stays.
    await expect(save(sections(), 0)).rejects.toMatchObject({ statusCode: 409 })
    await expect(save(sections(), 5)).rejects.toMatchObject({ statusCode: 409 })
    expect((await save(sections(), 1)).form.revision).toBe(2)

    const audit = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'family_form.update'))
    expect(audit.map(row => row.data?.revision).sort()).toEqual([1, 2])
    // The audit keeps the form before each save.
    const first = audit.find(row => row.data?.revision === 1)!.data!
    expect(first).toMatchObject({ changed: ['dog'], added: [], removed: [] })
    expect(question(first.previous as FormSection[], 'dog').label).toBe('Avete un cane che viaggia con voi?')
  })

  it('keeps the questions the code reads: only their text, help and place change', async () => {
    const without = sections()
    without[2]!.questions = without[2]!.questions.filter(item => item.id !== 'photoConsent')
    await expect(save(without, 0)).rejects.toMatchObject({ statusCode: 400 })

    // Moved, with a new text: fine. Options and requirement sent otherwise are the code's once saved.
    const moved = sections()
    const consent = moved[2]!.questions.shift()!
    moved[0]!.questions.push({ ...consent, label: 'Possiamo fotografarvi?', help: 'Per il sito.' })
    question(moved, 'accommodationNeeds').options!.pop()
    delete question(moved, 'publicationConsent').required
    const { form: saved } = await save(moved, 0)
    expect(question(saved.content.sections, 'accommodationNeeds').options).toHaveLength(3)
    expect(question(saved.content.sections, 'publicationConsent').required).toBe(true)
    expect(question(saved.content.sections, 'photoConsent').label).toBe('Possiamo fotografarvi?')

    // Type, options and requirement come from the code even when the saved copy is older: a change in the
    // code (a new lodging feature) reaches the families, and the next save is not refused.
    const [row] = await db.select().from(t.questionnaires)
    const stale = structuredClone(row!.content)
    question(stale.sections, 'accommodationNeeds').options = ['Cucina']
    await db.update(t.questionnaires).set({ content: stale })
    const read = await getFamilyForm(db)
    expect(question(read.content.sections, 'accommodationNeeds').options).toEqual(
      question(sections(), 'accommodationNeeds').options,
    )
    expect(question(read.content.sections, 'photoConsent').label).toBe('Possiamo fotografarvi?')
    expect((await save(read.content.sections, 1)).form.revision).toBe(2)
  })

  it('keeps the type of a question already in the form, text and long text excepted', async () => {
    const changed = sections()
    Object.assign(question(changed, 'howDidYouHear'), { type: 'text', options: undefined })
    await expect(save(changed, 0)).rejects.toMatchObject({ statusCode: 400 })

    const longer = sections()
    question(longer, 'association').type = 'textarea'
    expect((await save(longer, 0)).form.revision).toBe(1)

    // Back to short text would refuse the long answers already given.
    await expect(save(sections(), 1)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses ids objects already have', () => {
    const form = sections()
    form[0]!.questions.push({ id: 'constructor', label: 'Domanda', type: 'text' })
    expect(familyFormSaveSchema.safeParse({ revision: 0, sections: form }).success).toBe(false)
  })

  it('rewrites the answers that chose a renamed option', async () => {
    const { family } = await confirmedFamily()
    const { family: other } = await makeFamily(db, { formAnswers: { howDidYouHear: 'Altro' } })

    const form = sections()
    question(form, 'howDidYouHear').options![0] = 'Amici e parenti'
    question(form, 'sessionPreferences').options = ['Settimana estiva', 'Weekend']
    const { answersUpdated } = await save(form, 0, [
      { questionId: 'howDidYouHear', from: 'Passaparola', to: 'Amici e parenti' },
      { questionId: 'sessionPreferences', from: WEEKEND, to: 'Weekend' },
      { questionId: 'sessionPreferences', from: WEEK, to: 'Settimana estiva' },
    ])
    expect(answersUpdated).toBe(1)
    expect(await answersOf(family.id)).toMatchObject({
      howDidYouHear: 'Amici e parenti',
      // In the order of the options.
      sessionPreferences: ['Settimana estiva', 'Weekend'],
    })
    expect(await answersOf(other.id)).toEqual({ howDidYouHear: 'Altro' })

    // A rename that does not match the saved form (someone else changed it) is refused.
    await expect(
      save(form, 1, [{ questionId: 'howDidYouHear', from: 'Televisione', to: 'Amici e parenti' }]),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('keeps the answers to a question taken out, also when the family saves again', async () => {
    const { user, family } = await confirmedFamily()
    const form = sections()
    form[0]!.questions = form[0]!.questions.filter(item => item.id !== 'association')
    const { form: saved } = await save(form, 0)
    expect(saved.content.retired.map(item => item.id)).toEqual(['association'])

    // An answer to an id the form never had (an old version of the code) does not survive the save.
    await db
      .update(t.families)
      .set({ formAnswers: { ...(await answersOf(family.id)), dietaryNeeds: 'Senza glutine' } })
      .where(eq(t.families.id, family.id))
    const { association: _, ...rest } = ANSWERS
    await saveFamilyData(db, { familyId: family.id, data: familyData(rest), actor: { userId: user.id, ip: null } })
    const stored = await answersOf(family.id)
    expect(stored).toMatchObject({ association: 'Associazione Insieme', howDidYouHear: 'Passaparola' })
    expect(stored).not.toHaveProperty('dietaryNeeds')

    // Back in the form, it keeps its type (its answers are still there) and leaves `retired`.
    const back = sections()
    Object.assign(question(back, 'association'), { type: 'select', options: ['Sì', 'No'] })
    await expect(save(back, 1)).rejects.toMatchObject({ statusCode: 400 })
    expect((await save(sections(), 1)).form.content.retired).toEqual([])
  })

  it('asks a family that had confirmed for a new required question, without undoing the confirmation', async () => {
    const { user, family } = await confirmedFamily()
    const form = sections()
    form[1]!.questions.push({ id: 'arrival', label: 'Come arrivate al camp?', type: 'text', required: true })
    await save(form, 0)

    const home = () => familyHome(db, { userId: user.id, firstName: 'Anna', familyId: family.id })
    expect(await home()).toMatchObject({ formStatus: 'submitted', questionsToAnswer: 1 })

    const actor = { userId: user.id, ip: null }
    await expect(saveFamilyData(db, { familyId: family.id, data: familyData(), actor })).rejects.toMatchObject({
      statusCode: 400,
    })
    await saveFamilyData(db, { familyId: family.id, data: familyData({ ...ANSWERS, arrival: 'In auto' }), actor })
    expect(await home()).toMatchObject({ questionsToAnswer: 0 })

    // An option taken out leaves the families that chose it with a question to answer again.
    const fewer = structuredClone(form)
    question(fewer, 'howDidYouHear').options = ['Social network', 'Altro']
    await save(fewer, 1)
    expect(await home()).toMatchObject({ formStatus: 'submitted', questionsToAnswer: 1 })
  })

  it('refuses a family save made against an older form', async () => {
    const { user, family } = await confirmedFamily()
    const { form } = await save(sections(), 0)
    const actor = { userId: user.id, ip: null }
    await expect(
      saveFamilyData(db, { familyId: family.id, data: { ...familyData(), formRevision: 0 }, actor }),
    ).rejects.toMatchObject({ statusCode: 409, data: { reason: 'form_changed' } })
    await saveFamilyData(db, { familyId: family.id, data: { ...familyData(), formRevision: form.revision }, actor })
  })
})
