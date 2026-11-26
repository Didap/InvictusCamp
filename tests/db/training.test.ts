// «Formazione» against a real database (docs/spec.md 3.4): the administration proposes trainings, staff and v-team
// tick those that interest them, the administration sees who; deleting a proposal drops the interests in it.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { staffDetail } from '../../server/domain/staff'
import {
  createTrainingOption,
  deleteTrainingOption,
  myTraining,
  setTrainingInterest,
  trainingOptionsWithPeople,
  updateTrainingOption,
} from '../../server/domain/training'
import { makeAdmin, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()

describe('training', () => {
  it('is proposed, ticked, seen by the administration and deleted with its interests', async () => {
    const admin = await makeAdmin(db)
    const actor = { userId: admin.id, ip: null }
    const { user } = await makeStaff(db)
    const blsd = await createTrainingOption(db, { title: 'BLSD', description: null }, actor)
    const caa = await createTrainingOption(db, { title: 'CAA', description: 'Comunicazione' }, actor)

    await setTrainingInterest(db, { userId: user.id, optionId: blsd, interested: true })
    await setTrainingInterest(db, { userId: user.id, optionId: blsd, interested: true })
    expect((await myTraining(db, user.id)).map(o => [o.title, o.interested])).toEqual([
      ['BLSD', true],
      ['CAA', false],
    ])
    const [first] = await trainingOptionsWithPeople(db)
    expect(first).toMatchObject({ id: blsd, people: [{ userId: user.id, team: 'staff' }] })
    expect((await staffDetail(db, user.id)).training).toEqual([{ id: blsd, title: 'BLSD' }])

    await updateTrainingOption(db, blsd, { title: 'Primo soccorso (BLSD)', description: null }, actor)
    expect((await staffDetail(db, user.id)).training).toEqual([{ id: blsd, title: 'Primo soccorso (BLSD)' }])
    const [renamed] = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'training.update'))
    expect(renamed!.data).toEqual({ from: 'BLSD', to: 'Primo soccorso (BLSD)', description: false })
    // The same values again: nothing to write, nothing to audit.
    await updateTrainingOption(db, blsd, { title: 'Primo soccorso (BLSD)', description: null }, actor)
    expect(await db.$count(t.auditLog, eq(t.auditLog.action, 'training.update'))).toBe(1)
    await setTrainingInterest(db, { userId: user.id, optionId: blsd, interested: false })
    await setTrainingInterest(db, { userId: user.id, optionId: caa, interested: true })

    await deleteTrainingOption(db, caa, actor)
    expect(await db.$count(t.trainingInterests, eq(t.trainingInterests.userId, user.id))).toBe(0)
    const [audit] = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'training.delete'))
    expect(audit!.data).toEqual({ title: 'CAA', people: 1 })
    await expect(
      setTrainingInterest(db, { userId: user.id, optionId: randomUUID(), interested: true }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
