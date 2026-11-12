// Lodgings (docs/spec.md 3.11): the layout of the camp and the family placed in each lodging of a session.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  assignLodging,
  createLodging,
  deleteLodging,
  listLodgings,
  lodgingsCsv,
  sessionLodgingsOf,
  updateLodging,
} from '../../server/domain/lodgings'
import { answerInvitation, cancelParticipation } from '../../server/domain/sessions'
import { lodgingSchema, type LodgingInput } from '../../shared/schemas/lodgings'
import type { ParticipationKind, ParticipationStatus, SessionStatus } from '../../shared/utils/constants'
import { makeAdmin, makeFamily, makeSession, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx = { appUrl: 'http://localhost:3080' }

const lodging = (values: Partial<LodgingInput> = {}) =>
  createLodging(db, lodgingSchema.parse({ name: 'Villetta 1', beds: 4, ...values }))

async function setup(status: SessionStatus = 'confirmed') {
  const admin = await makeAdmin(db)
  const session = await makeSession(db, { status })
  return { session, actor: { userId: admin.id, ip: '127.0.0.1' } }
}

/** A family in the session with `people` cards and the given accommodation needs. */
async function join(
  sessionId: string,
  name: string,
  options: { kind?: ParticipationKind; status?: ParticipationStatus; people?: number; needs?: string[] } = {},
) {
  const { family } = await makeFamily(db, {
    name,
    formAnswers: options.needs ? { accommodationNeeds: options.needs } : {},
  })
  const people = options.people ?? 0
  if (people) {
    await db.insert(t.familyMembers).values(Array.from({ length: people }, () => ({ familyId: family.id })))
  }
  const kind = options.kind ?? 'slot'
  const status = options.status ?? 'confirmed'
  const [participation] = await db
    .insert(t.sessionFamilies)
    .values({
      sessionId,
      familyId: family.id,
      kind,
      status,
      reserveRank: kind === 'reserve' ? 1 : null,
      invitedAt: status === 'selected' ? null : new Date(),
    })
    .returning()
  return { family, participation: participation! }
}

async function lodgingOf(participationId: string) {
  const [row] = await db
    .select({ lodgingId: t.sessionFamilies.lodgingId })
    .from(t.sessionFamilies)
    .where(eq(t.sessionFamilies.id, participationId))
  return row!.lodgingId
}

describe('the layout', () => {
  it('lists the lodgings by area, then by name with numbers in order, those without an area last', async () => {
    await lodging({ name: 'Villetta 10', area: 'Villette' })
    await lodging({ name: 'Villetta 2', area: 'Villette' })
    await lodging({ name: 'Tenda', area: '' })
    await lodging({ name: 'Camera 1', area: 'Residence', features: ['microwave', 'kitchen', 'microwave'] })
    const list = await listLodgings(db)
    expect(list.map(item => item.name)).toEqual(['Camera 1', 'Villetta 2', 'Villetta 10', 'Tenda'])
    expect(list[0]).toMatchObject({ features: ['kitchen', 'microwave'], sessions: 0, description: null })
    expect(list[3]!.area).toBeNull()
  })

  it('edits and deletes a lodging; a missing one is 404', async () => {
    const { actor } = await setup()
    const id = await lodging()
    await updateLodging(db, id, lodgingSchema.parse({ name: 'Villetta A', beds: 6, description: 'Due camere' }))
    expect((await listLodgings(db))[0]).toMatchObject({ name: 'Villetta A', beds: 6, description: 'Due camere' })
    await deleteLodging(db, id, actor)
    expect(await listLodgings(db)).toEqual([])
    await expect(deleteLodging(db, id, actor)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses a lodging without beds', () => {
    expect(lodgingSchema.safeParse({ name: 'Villetta', beds: 0 }).success).toBe(false)
  })
})

describe('a session', () => {
  it('lists the families holding a place, with their people and needs, not the reserves nor who declined', async () => {
    const { session } = await setup('inviting')
    await join(session.id, 'Famiglia Rossi', { people: 4, needs: ['Cucina', 'Bagno senza barriere architettoniche'] })
    await join(session.id, 'Famiglia Bianchi', { status: 'invited' })
    await join(session.id, 'Famiglia Verdi', { status: 'declined' })
    await join(session.id, 'Famiglia Neri', { kind: 'reserve', status: 'invited' })
    const dto = await sessionLodgingsOf(db, session.id)
    expect(dto.editable).toBe(true)
    expect(dto.families.map(family => family.familyName)).toEqual(['Famiglia Bianchi', 'Famiglia Rossi'])
    expect(dto.families[1]).toMatchObject({ people: 4, needs: ['kitchen', 'accessible_bathroom'], lodgingId: null })
  })

  it('places a family, one family per lodging, and takes it out again', async () => {
    const { session, actor } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi')
    const bianchi = await join(session.id, 'Famiglia Bianchi')
    const villetta = await lodging()
    await assignLodging(db, {
      sessionId: session.id,
      participationId: rossi.participation.id,
      lodgingId: villetta,
      actor,
    })
    expect(await lodgingOf(rossi.participation.id)).toBe(villetta)
    expect((await listLodgings(db))[0]!.sessions).toBe(1)

    await expect(
      assignLodging(db, {
        sessionId: session.id,
        participationId: bianchi.participation.id,
        lodgingId: villetta,
        actor,
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: '«Villetta 1» è già assegnato a Famiglia Rossi' })

    await assignLodging(db, { sessionId: session.id, participationId: rossi.participation.id, lodgingId: null, actor })
    await assignLodging(db, {
      sessionId: session.id,
      participationId: bianchi.participation.id,
      lodgingId: villetta,
      actor,
    })
    expect(await lodgingOf(bianchi.participation.id)).toBe(villetta)
    const audits = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'participation.lodging'))
    expect(audits).toHaveLength(3)
  })

  it('lets the same lodging host a different family in another session', async () => {
    const { session, actor } = await setup()
    const other = await makeSession(db, { status: 'draft' })
    const villetta = await lodging()
    const rossi = await join(session.id, 'Famiglia Rossi')
    const bianchi = await join(other.id, 'Famiglia Bianchi', { status: 'selected' })
    await assignLodging(db, {
      sessionId: session.id,
      participationId: rossi.participation.id,
      lodgingId: villetta,
      actor,
    })
    await assignLodging(db, {
      sessionId: other.id,
      participationId: bianchi.participation.id,
      lodgingId: villetta,
      actor,
    })
    expect((await listLodgings(db))[0]!.sessions).toBe(2)
  })

  it('refuses a reserve, a family of another session, a missing lodging and a closed session', async () => {
    const { session, actor } = await setup()
    const villetta = await lodging()
    const reserve = await join(session.id, 'Famiglia Neri', { kind: 'reserve', status: 'invited' })
    const other = await makeSession(db)
    const elsewhere = await join(other.id, 'Famiglia Gialli')
    const rossi = await join(session.id, 'Famiglia Rossi')
    for (const participationId of [reserve.participation.id, elsewhere.participation.id]) {
      await expect(
        assignLodging(db, { sessionId: session.id, participationId, lodgingId: villetta, actor }),
      ).rejects.toMatchObject({ statusCode: 404 })
    }
    await expect(
      assignLodging(db, {
        sessionId: session.id,
        participationId: rossi.participation.id,
        lodgingId: '00000000-0000-4000-8000-000000000000',
        actor,
      }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Alloggio non trovato' })

    await db.update(t.campSessions).set({ status: 'completed' }).where(eq(t.campSessions.id, session.id))
    await expect(
      assignLodging(db, { sessionId: session.id, participationId: rossi.participation.id, lodgingId: villetta, actor }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect((await sessionLodgingsOf(db, session.id)).editable).toBe(false)
  })

  it('frees the lodging of a family that declines or is removed', async () => {
    const { session, actor } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi', { status: 'invited' })
    const bianchi = await join(session.id, 'Famiglia Bianchi')
    const [one, two] = [await lodging(), await lodging({ name: 'Villetta 2' })]
    await assignLodging(db, { sessionId: session.id, participationId: rossi.participation.id, lodgingId: one, actor })
    await assignLodging(db, { sessionId: session.id, participationId: bianchi.participation.id, lodgingId: two, actor })

    await answerInvitation(db, {
      participationId: rossi.participation.id,
      answer: 'declined',
      by: 'admin',
      sessionId: session.id,
      actor,
    })
    await cancelParticipation(db, ctx, { sessionId: session.id, participationId: bianchi.participation.id, actor })
    expect(await lodgingOf(rossi.participation.id)).toBeNull()
    expect(await lodgingOf(bianchi.participation.id)).toBeNull()
  })

  it('deletes a lodging of an open session, audited, but not one in the layout of a completed session', async () => {
    const { session, actor } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi')
    const [villetta, camera] = [await lodging(), await lodging({ name: 'Camera 1' })]
    const place = (lodgingId: string) =>
      assignLodging(db, { sessionId: session.id, participationId: rossi.participation.id, lodgingId, actor })
    await place(villetta)
    await deleteLodging(db, villetta, actor)
    expect(await lodgingOf(rossi.participation.id)).toBeNull()
    const [entry] = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'lodging.delete'))
    expect(entry!.data).toEqual({
      name: 'Villetta 1',
      freed: [{ participationId: rossi.participation.id, sessionId: session.id }],
    })

    await place(camera)
    await db.update(t.campSessions).set({ status: 'completed' }).where(eq(t.campSessions.id, session.id))
    await expect(deleteLodging(db, camera, actor)).rejects.toMatchObject({
      statusCode: 409,
      message: '«Camera 1» è nello schema di una sessione conclusa: non si può eliminare',
    })
    expect(await lodgingOf(rossi.participation.id)).toBe(camera)
  })

  it('keeps a lodging only on a titolare holding a place, in the database too', async () => {
    const { session } = await setup()
    const reserve = await join(session.id, 'Famiglia Neri', { kind: 'reserve', status: 'invited' })
    const villetta = await lodging()
    await expect(
      db
        .update(t.sessionFamilies)
        .set({ lodgingId: villetta })
        .where(eq(t.sessionFamilies.id, reserve.participation.id)),
    ).rejects.toThrow()
  })

  it('writes the layout as CSV: every lodging, what does not fit, then the families without one', async () => {
    const { session, actor } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi', {
      people: 5,
      needs: ['Bagno senza barriere architettoniche'],
    })
    await join(session.id, 'Famiglia Bianchi', { people: 3 })
    await join(session.id, 'Famiglia Verdi')
    const villetta = await lodging({ area: 'Villette', features: ['kitchen'] })
    await lodging({ name: 'Camera 1', area: 'Residence', beds: 3 })
    await assignLodging(db, {
      sessionId: session.id,
      participationId: rossi.participation.id,
      lodgingId: villetta,
      actor,
    })

    const { filename, csv } = await lodgingsCsv(db, session.id)
    expect(filename).toBe('alloggi-sessione-di-prova-21-06-2027.csv')
    expect(csv.replace('﻿', '').trim().split('\r\n')).toEqual([
      'Zona;Alloggio;Posti letto;Dotazioni;Famiglia;Persone;Esigenze;Da controllare',
      'Residence;Camera 1;3;;;;;',
      'Villette;Villetta 1;4;Cucina;Famiglia Rossi;5;Bagno senza barriere;5 persone e 4 posti letto. Manca: Bagno senza barriere',
      ';;;;Famiglia Bianchi;3;;Senza alloggio',
      ';;;;Famiglia Verdi;;;Componenti non ancora indicati. Senza alloggio',
    ])
  })
})
