// Lodgings (docs/spec.md 3.11): the layout of the camp and the family placed in each lodging of a session.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  assignLodging,
  assignStaffLodging,
  createLodging,
  deleteLodging,
  listLodgings,
  lodgingsCsv,
  lodgingsPdf,
  lodgingsPdfBlocks,
  sessionLayout,
  sessionLodgingsOf,
  updateLodging,
} from '../../server/domain/lodgings'
import { answerInvitation, cancelParticipation } from '../../server/domain/sessions'
import { lodgingSchema, type LodgingInput } from '../../shared/schemas/lodgings'
import type { ParticipationKind, ParticipationStatus, SessionStatus } from '../../shared/utils/constants'
import { formatDayRange } from '../../shared/utils/format'
import { sniffMimeType } from '../../server/domain/storage'
import { makeAdmin, makeFamily, makeSession, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx = { appUrl: 'http://localhost:3080' }

const lodging = (values: Partial<LodgingInput> = {}) =>
  createLodging(db, lodgingSchema.parse({ name: 'Villetta 1', location: 'invictus_camp', beds: 4, ...values }))

async function setup(status: SessionStatus = 'confirmed') {
  const admin = await makeAdmin(db)
  const session = await makeSession(db, { status })
  const actor = { userId: admin.id, ip: '127.0.0.1' }
  /** Places a participation in a lodging, in its own session. */
  const place = (participation: { id: string; sessionId: string }, lodgingId: string | null) =>
    assignLodging(db, { sessionId: participation.sessionId, participationId: participation.id, lodgingId, actor })
  return { session, actor, place }
}

/** A family in the session with `people` cards and the given accommodation needs. */
async function join(
  sessionId: string,
  name: string,
  options: {
    kind?: ParticipationKind
    status?: ParticipationStatus
    people?: number
    needs?: string[]
    phone?: string
  } = {},
) {
  const { family } = await makeFamily(db, {
    name,
    phone: options.phone ?? null,
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
  it('lists the lodgings by location, in the order of the list, then by name with numbers in order', async () => {
    await lodging({ name: 'Villetta 10' })
    await lodging({ name: 'Villetta 2' })
    await lodging({ name: 'Appartamento 1', location: 'torricella', doubleBeds: 1, sofaBeds: 1, accessible: true })
    await lodging({ name: 'Camera 1', location: 'melina', features: ['microwave', 'kitchen', 'microwave'] })
    const list = await listLodgings(db)
    expect(list.map(item => item.name)).toEqual(['Camera 1', 'Appartamento 1', 'Villetta 2', 'Villetta 10'])
    expect(list[0]).toMatchObject({ features: ['kitchen', 'microwave'], sessions: 0, description: null })
    expect(list[1]).toMatchObject({ singleBeds: 0, doubleBeds: 1, sofaBeds: 1, accessible: true })
  })

  it('edits and deletes a lodging; a missing one is 404', async () => {
    const { actor } = await setup()
    const id = await lodging()
    await updateLodging(
      db,
      id,
      lodgingSchema.parse({ name: 'Villetta A', location: 'melina', beds: 6, description: 'Due camere' }),
    )
    expect((await listLodgings(db))[0]).toMatchObject({ name: 'Villetta A', beds: 6, description: 'Due camere' })
    await deleteLodging(db, id, actor)
    expect(await listLodgings(db)).toEqual([])
    await expect(deleteLodging(db, id, actor)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses a lodging without beds, without a location, or with a negative number of beds of a kind', () => {
    const valid = { name: 'Villetta', location: 'melina', beds: 2 }
    expect(lodgingSchema.safeParse(valid).success).toBe(true)
    expect(lodgingSchema.safeParse({ ...valid, beds: 0 }).success).toBe(false)
    expect(lodgingSchema.safeParse({ ...valid, location: 'Villette' }).success).toBe(false)
    expect(lodgingSchema.safeParse({ ...valid, sofaBeds: -1 }).success).toBe(false)
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
    const { session, place } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi')
    const bianchi = await join(session.id, 'Famiglia Bianchi')
    const villetta = await lodging()
    await place(rossi.participation, villetta)
    expect(await lodgingOf(rossi.participation.id)).toBe(villetta)
    expect((await listLodgings(db))[0]!.sessions).toBe(1)

    await expect(place(bianchi.participation, villetta)).rejects.toMatchObject({
      statusCode: 409,
      message: '«Villetta 1 (Alloggi Invictus Camp)» è già assegnato a Famiglia Rossi',
    })

    await place(rossi.participation, null)
    await place(bianchi.participation, villetta)
    expect(await lodgingOf(bianchi.participation.id)).toBe(villetta)
    const audits = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'participation.lodging'))
    expect(audits).toHaveLength(3)
  })

  it('lets the same lodging host a different family in another session', async () => {
    const { session, place } = await setup()
    const other = await makeSession(db, { status: 'draft' })
    const villetta = await lodging()
    const rossi = await join(session.id, 'Famiglia Rossi')
    const bianchi = await join(other.id, 'Famiglia Bianchi', { status: 'selected' })
    await place(rossi.participation, villetta)
    await place(bianchi.participation, villetta)
    expect((await listLodgings(db))[0]!.sessions).toBe(2)
  })

  it('refuses a reserve, a family of another session, a missing lodging and a closed session', async () => {
    const { session, actor, place } = await setup()
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
    await expect(place(rossi.participation, villetta)).rejects.toMatchObject({ statusCode: 409 })
    expect((await sessionLodgingsOf(db, session.id)).editable).toBe(false)
  })

  it('frees the lodging of a family that declines or is removed', async () => {
    const { session, actor, place } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi', { status: 'invited' })
    const bianchi = await join(session.id, 'Famiglia Bianchi')
    const [one, two] = [await lodging(), await lodging({ name: 'Villetta 2' })]
    await place(rossi.participation, one)
    await place(bianchi.participation, two)

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
    const { session, actor, place } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi')
    const [villetta, camera] = [await lodging(), await lodging({ name: 'Camera 1' })]
    await place(rossi.participation, villetta)
    await deleteLodging(db, villetta, actor)
    expect(await lodgingOf(rossi.participation.id)).toBeNull()
    const [entry] = await db.select().from(t.auditLog).where(eq(t.auditLog.action, 'lodging.delete'))
    expect(entry!.data).toEqual({
      name: 'Villetta 1',
      freed: [{ participationId: rossi.participation.id, sessionId: session.id }],
      freedStaff: [],
    })

    await place(rossi.participation, camera)
    await db.update(t.campSessions).set({ status: 'completed' }).where(eq(t.campSessions.id, session.id))
    await expect(deleteLodging(db, camera, actor)).rejects.toMatchObject({
      statusCode: 409,
      message: '«Camera 1 (Alloggi Invictus Camp)» è nello schema di una sessione conclusa: non si può eliminare',
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

  it('places the staff, several in a lodging, never with a family, and lists them in the CSV', async () => {
    const { session, actor, place } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi', { people: 3 })
    const villetta = await lodging({ name: 'Villetta 1', beds: 4 })
    const camera = await lodging({ name: 'Camera 1', beds: 1 })
    const convoke = async (status: 'accepted' | 'declined' = 'accepted') => {
      const { user } = await makeStaff(db)
      const [row] = await db
        .insert(t.sessionStaff)
        .values({ sessionId: session.id, userId: user.id, status })
        .returning()
      return row!
    }
    const anna = await convoke()
    const luca = await convoke()
    const declined = await convoke('declined')
    const placeStaff = (convocationId: string, lodgingId: string | null) =>
      assignStaffLodging(db, { sessionId: session.id, convocationId, lodgingId, actor })

    await place(rossi.participation, villetta)
    await expect(placeStaff(anna.id, villetta)).rejects.toMatchObject({ statusCode: 409 })
    await placeStaff(anna.id, camera)
    await placeStaff(luca.id, camera)
    await expect(place(rossi.participation, camera)).rejects.toMatchObject({ statusCode: 409 })
    await expect(placeStaff(declined.id, camera)).rejects.toMatchObject({ statusCode: 404 })

    const tab = await sessionLodgingsOf(db, session.id)
    expect(tab.staff.map(person => person.lodgingId)).toEqual([camera, camera])
    const { csv } = await lodgingsCsv(db, session.id)
    expect(csv).toContain(';Camera 1;1;;No;;')
    expect(csv).toContain('2 persone e 1 posto letto')
    expect((await listLodgings(db)).find(item => item.id === camera)?.sessions).toBe(1)
  })

  it('writes the layout as CSV: every lodging, what does not fit, then the families without one', async () => {
    const { session, place } = await setup()
    const rossi = await join(session.id, 'Famiglia Rossi', {
      people: 5,
      needs: ['Bagno senza barriere architettoniche'],
      phone: '333 1234567',
    })
    const bianchi = await join(session.id, 'Famiglia Bianchi', { people: 3 })
    await join(session.id, 'Famiglia Verdi')
    const villetta = await lodging({ features: ['kitchen'], doubleBeds: 1, singleBeds: 2 })
    await lodging({ name: 'Camera 1', location: 'melina', beds: 3, accessible: true })
    await place(rossi.participation, villetta)

    const { filename, csv } = await lodgingsCsv(db, session.id)
    expect(filename).toBe('alloggi-sessione-di-prova-21-06-2027.csv')
    expect(csv.replace('﻿', '').trim().split('\r\n')).toEqual([
      'Località;Alloggio;Posti letto;Letti;Accessibile;Dotazioni;Chi ci dorme;Referente;Telefono;Persone;Esigenze;Da controllare',
      'B&B Melina;Camera 1;3;;Sì;;;;;;;',
      'Alloggi Invictus Camp;Villetta 1;4;1 letto matrimoniale, 2 letti singoli;No;Cucina;Famiglia Rossi;Prova Utente;333 1234567;5;Bagno senza barriere;5 persone e 4 posti letto. Manca: Bagno senza barriere',
      ';;;;;;Famiglia Bianchi;Prova Utente;;3;;Senza alloggio',
      ';;;;;;Famiglia Verdi;Prova Utente;;;;Componenti non ancora indicati. Senza alloggio',
    ])

    // The PDF: by location in the order of the list, each lodging with who sleeps in it and who to call
    // (the account's phone when the family has none), how it is made; then who has no lodging. What does
    // not fit is not in it: next to a name and a phone it would tell what the family needs.
    await db.update(t.users).set({ phone: '080 1234567' }).where(eq(t.users.id, bianchi.family.userId))
    const { user: anna } = await makeStaff(db)
    await db.insert(t.sessionStaff).values({ sessionId: session.id, userId: anna.id, status: 'accepted' })
    expect(lodgingsPdfBlocks(await sessionLayout(db, session.id))).toEqual([
      `Sessione di prova, ${formatDayRange(session.startDate, session.endDate, 'long')}.`,
      { heading: 'B&B Melina' },
      { label: 'Camera 1' },
      'Libero.',
      '3 posti letto · Accessibile',
      { heading: 'Alloggi Invictus Camp' },
      { label: 'Villetta 1' },
      'Famiglia Rossi, 5 persone. Referente: Prova Utente, 333 1234567.',
      '4 posti letto (1 letto matrimoniale, 2 letti singoli) · Cucina',
      { heading: 'Senza alloggio' },
      'Famiglia Bianchi, 3 persone. Referente: Prova Utente, 080 1234567.',
      'Famiglia Verdi, componenti non ancora indicati. Referente: Prova Utente, telefono non indicato.',
      'Staff: Prova Utente (Staff).',
    ])
    // The tab gets the families without their contacts.
    expect((await sessionLodgingsOf(db, session.id)).families[0]).not.toHaveProperty('phone')
    const pdf = await lodgingsPdf(db, session.id)
    expect(pdf.filename).toBe('alloggi-sessione-di-prova-21-06-2027.pdf')
    expect(sniffMimeType(pdf.data)).toBe('application/pdf')
  })
})
