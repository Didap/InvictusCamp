import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  addFamilyMember,
  addPersonalDocument,
  adminFamilyDetail,
  adminFamilyHealth,
  familyHome,
  familyProfile,
  listFamilies,
  listPersonalDocuments,
  ownFamilyMembers,
  removeFamilyMember,
  removePersonalDocument,
  requireFamilyMember,
  saveFamilyData,
  setHealthConsent,
  updateFamilyDataByAdmin,
  updateFamilyMember,
} from '../../server/domain/families'
import { adminFamilyListQuerySchema, type FamilyDataInput, type MemberInput } from '../../shared/schemas/families'
import { makeAdmin, makeDocument, makeFamily, makeSession, t, useTestDb } from './helpers'

const db = useTestDb()
const uploadsDir = mkdtempSync(join(tmpdir(), 'invictus-a3-'))

const child = (values: Partial<MemberInput> = {}): MemberInput => ({
  firstName: 'Matteo',
  lastName: 'Prova',
  birthDate: '2015-04-12',
  relationship: 'child',
  kind: 'young',
  isReferent: false,
  ...values,
})

const WEEKEND = 'Sessioni nel weekend (2 notti)'
const WEEK = 'Sessioni settimanali estive (4 notti)'
const ANSWERS = { howDidYouHear: 'Passaparola', sessionPreferences: [WEEKEND] }

/** The family data as /famiglia/profilo sends it: the account holder and one young person. */
const familyData = (values: Partial<FamilyDataInput> = {}): FamilyDataInput => ({
  name: 'Famiglia Prova',
  address: 'Via Roma 1',
  city: 'Taranto',
  postalCode: '74121',
  province: 'TA',
  region: 'Puglia',
  phone: '',
  composition: { adults: 1, youngWithCondition: 0, youngWithoutCondition: 1 },
  healthConsent: false,
  answers: ANSWERS,
  ...values,
})

const withDisability = { hasDisability: true, disability: { description: 'Descrizione riservata', mobility: '' } }

async function familyWithReferent(values: Parameters<typeof makeFamily>[1] = {}) {
  const { user, family } = await makeFamily(db, values)
  const [referent] = await db
    .insert(t.familyMembers)
    .values({ familyId: family.id, firstName: 'Anna', lastName: 'Prova', relationship: 'parent', isReferent: true })
    .returning()
  return { user, family, referent: referent!, actor: { userId: user.id, ip: '127.0.0.1' } }
}

async function makeFile(ownerUserId: string) {
  const [file] = await db
    .insert(t.files)
    .values({
      storageKey: `test/${crypto.randomUUID()}.pdf`,
      originalName: 'certificato.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: '0'.repeat(64),
      purpose: 'personal_document',
      ownerUserId,
      uploadedBy: ownerUserId,
    })
    .returning()
  return file!
}

const auditRows = (action: string) => db.select().from(t.auditLog).where(eq(t.auditLog.action, action))

describe('ownership', () => {
  it('a family never reads, changes or removes the members of another family', async () => {
    const a = await familyWithReferent()
    const b = await familyWithReferent()
    const matteo = await addFamilyMember(db, { familyId: a.family.id, member: child(), actor: a.actor })

    const seenByB = await ownFamilyMembers(db, b.family.id)
    expect(seenByB.members.map(m => m.id)).not.toContain(matteo.id)
    await expect(requireFamilyMember(db, b.family.id, matteo.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      updateFamilyMember(db, {
        familyId: b.family.id,
        memberId: matteo.id,
        member: child({ firstName: 'Cambiato' }),
        actor: b.actor,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      removeFamilyMember(db, { familyId: b.family.id, memberId: matteo.id, actor: b.actor }),
    ).rejects.toMatchObject({ statusCode: 404 })

    const [still] = await db.select().from(t.familyMembers).where(eq(t.familyMembers.id, matteo.id))
    expect(still!.firstName).toBe('Matteo')
  })

  it('a personal document can name only a member of the same family and be removed only by its account', async () => {
    const a = await familyWithReferent()
    const b = await familyWithReferent()
    const fileA = await makeFile(a.user.id)
    await expect(
      addPersonalDocument(db, {
        familyId: a.family.id,
        userId: a.user.id,
        document: { category: 'id_document', title: 'Carta d’identità', familyMemberId: b.referent.id },
        fileId: fileA.id,
        uploadedBy: a.user.id,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })

    const { id } = await addPersonalDocument(db, {
      familyId: a.family.id,
      userId: a.user.id,
      document: { category: 'id_document', title: 'Carta d’identità', familyMemberId: a.referent.id },
      fileId: fileA.id,
      uploadedBy: a.user.id,
    })
    const listed = await listPersonalDocuments(db, a.user.id)
    expect(listed).toHaveLength(1)
    expect(listed[0]!.member?.id).toBe(a.referent.id)
    expect(await listPersonalDocuments(db, b.user.id)).toHaveLength(0)

    await expect(removePersonalDocument(db, uploadsDir, { userId: b.user.id, documentId: id })).rejects.toMatchObject({
      statusCode: 404,
    })
    await removePersonalDocument(db, uploadsDir, { userId: a.user.id, documentId: id })
    expect(await listPersonalDocuments(db, a.user.id)).toHaveLength(0)
    expect(await db.select().from(t.files).where(eq(t.files.id, fileA.id))).toHaveLength(0)
  })
})

describe('health data consent', () => {
  it('refuses health details before the consent', async () => {
    const { family, actor } = await familyWithReferent()
    await expect(
      addFamilyMember(db, { familyId: family.id, member: child({ health: withDisability }), actor }),
    ).rejects.toMatchObject({ statusCode: 403 })
    // No health in the body (or an empty one) is fine.
    const member = await addFamilyMember(db, {
      familyId: family.id,
      member: child({ health: { hasDisability: false, disability: null } }),
      actor,
    })
    expect(member.health).toBeNull()
    await expect(
      updateFamilyMember(db, {
        familyId: family.id,
        memberId: member.id,
        member: child({ health: withDisability }),
        actor,
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(await auditRows('member.health_update')).toHaveLength(0)
  })

  it('stores the details after the consent and audits the change without the values', async () => {
    const { family, actor } = await familyWithReferent()
    await setHealthConsent(db, { familyId: family.id, given: true, actor })
    const member = await addFamilyMember(db, { familyId: family.id, member: child({ health: withDisability }), actor })
    expect(member.health).toEqual({ hasDisability: true, disability: { description: 'Descrizione riservata' } })

    const [audit] = await auditRows('member.health_update')
    expect(audit!.entityId).toBe(member.id)
    expect(audit!.data).toEqual({ familyId: family.id, fields: ['hasDisability', 'description'] })
    expect(JSON.stringify(audit!.data)).not.toContain('Descrizione riservata')

    // Without `health` the details stay as they are, and nothing is audited.
    await updateFamilyMember(db, {
      familyId: family.id,
      memberId: member.id,
      member: child({ firstName: 'Matteo Luca' }),
      actor,
    })
    const [row] = await db.select().from(t.familyMembers).where(eq(t.familyMembers.id, member.id))
    expect(row!.hasDisability).toBe(true)
    expect(row!.disability).toEqual({ description: 'Descrizione riservata' })
    expect(await auditRows('member.health_update')).toHaveLength(1)

    // Turning the flag off drops the details too.
    await updateFamilyMember(db, {
      familyId: family.id,
      memberId: member.id,
      member: child({ health: { hasDisability: false, disability: { description: 'resta?' } } }),
      actor,
    })
    const [cleared] = await db.select().from(t.familyMembers).where(eq(t.familyMembers.id, member.id))
    expect(cleared!.disability).toBeNull()
    expect(await auditRows('member.health_update')).toHaveLength(2)
  })

  it('withdrawing the consent deletes every health detail and hides the fields', async () => {
    const { family, actor } = await familyWithReferent()
    await setHealthConsent(db, { familyId: family.id, given: true, actor })
    const again = await setHealthConsent(db, { familyId: family.id, given: true, actor })
    expect(again.cleared).toBe(0)
    expect(await auditRows('family.health_consent')).toHaveLength(1)
    await addFamilyMember(db, { familyId: family.id, member: child({ health: withDisability }), actor })
    await addFamilyMember(db, { familyId: family.id, member: child({ firstName: 'Sofia' }), actor })

    const result = await setHealthConsent(db, { familyId: family.id, given: false, actor })
    expect(result).toEqual({ healthDataConsentAt: null, cleared: 1, documentsRemoved: 0, storageKeys: [] })
    const rows = await db.select().from(t.familyMembers).where(eq(t.familyMembers.familyId, family.id))
    expect(rows.every(row => !row.hasDisability && row.disability === null)).toBe(true)
    const own = await ownFamilyMembers(db, family.id)
    expect(own.healthDataConsentAt).toBeNull()
    expect(own.members.every(member => member.health === null)).toBe(true)

    const withdrawn = await db
      .select()
      .from(t.auditLog)
      .where(and(eq(t.auditLog.action, 'member.health_update'), eq(t.auditLog.entityType, 'family_member')))
    expect(withdrawn.map(row => (row.data as { reason?: string }).reason)).toContain('consent_withdrawn')
    expect(await adminFamilyHealth(db, family.id)).toEqual({ healthDataConsentAt: null, members: [] })
  })
})

describe('health documents', () => {
  it('certificates and diagnoses need the consent, and withdrawing it deletes them with their files', async () => {
    const { user, family, referent, actor } = await familyWithReferent()
    const upload = async (category: 'diagnosis' | 'medical_certificate' | 'id_document') => {
      const file = await makeFile(user.id)
      await addPersonalDocument(db, {
        familyId: family.id,
        userId: user.id,
        document: { category, title: category, familyMemberId: referent.id },
        fileId: file.id,
        uploadedBy: user.id,
      })
      return file
    }
    await expect(upload('diagnosis')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('serve il consenso ai dati sulla salute'),
    })
    await upload('id_document')

    await setHealthConsent(db, { familyId: family.id, given: true, actor })
    const health = [await upload('diagnosis'), await upload('medical_certificate')]
    expect((await ownFamilyMembers(db, family.id)).healthDocuments).toBe(2)

    const result = await setHealthConsent(db, { familyId: family.id, given: false, actor })
    expect(result).toMatchObject({ healthDataConsentAt: null, cleared: 0, documentsRemoved: 2 })
    expect([...result.storageKeys].sort()).toEqual(health.map(file => file.storageKey).sort())
    expect((await listPersonalDocuments(db, user.id)).map(document => document.category)).toEqual(['id_document'])
    const ids = health.map(file => file.id)
    expect(await db.select().from(t.files).where(inArray(t.files.id, ids))).toEqual([])
    const withdrawn = (await auditRows('family.health_consent')).find(row => !(row.data as { given: boolean }).given)
    expect(withdrawn!.data).toEqual({ given: false, cleared: 0, documentsRemoved: 2 })
  })
})

describe('members', () => {
  it('keep at least one referent', async () => {
    const { family, referent, actor } = await familyWithReferent()
    await expect(removeFamilyMember(db, { familyId: family.id, memberId: referent.id, actor })).rejects.toMatchObject({
      statusCode: 409,
    })
    await expect(
      updateFamilyMember(db, {
        familyId: family.id,
        memberId: referent.id,
        member: child({ firstName: 'Anna', relationship: 'parent', isReferent: false }),
        actor,
      }),
    ).rejects.toMatchObject({ statusCode: 409 })

    const other = await addFamilyMember(db, {
      familyId: family.id,
      member: child({ firstName: 'Paolo', relationship: 'parent', isReferent: true }),
      actor,
    })
    await removeFamilyMember(db, { familyId: family.id, memberId: referent.id, actor })
    const own = await ownFamilyMembers(db, family.id)
    expect(own.members.map(member => member.id)).toEqual([other.id])
  })
})

describe('family data', () => {
  it('keeps only known questions and valid values, and refuses a missing or wrong answer', async () => {
    const { family, actor } = await familyWithReferent()
    await expect(
      saveFamilyData(db, {
        familyId: family.id,
        data: familyData({ answers: { howDidYouHear: 'Passaparola' } }),
        actor,
      }),
    ).rejects.toMatchObject({ statusCode: 400, data: { missing: ['sessionPreferences'] } })
    await expect(
      saveFamilyData(db, {
        familyId: family.id,
        data: familyData({ answers: { ...ANSWERS, howDidYouHear: 'Televisione' } }),
        actor,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })

    const { family: saved } = await saveFamilyData(db, {
      familyId: family.id,
      data: familyData({
        answers: {
          howDidYouHear: 'Passaparola',
          unknownQuestion: 'x',
          association: '   ',
          sessionPreferences: [WEEK, WEEKEND, WEEK],
        },
      }),
      actor,
    })
    expect(saved.formAnswers).toEqual({ howDidYouHear: 'Passaparola', sessionPreferences: [WEEKEND, WEEK] })
    expect(saved).toMatchObject({ postalCode: '74121', region: 'Puglia', formStatus: 'submitted' })
  })

  it('creates one empty card per person declared, counting the cards already there', async () => {
    const { family, actor } = await familyWithReferent()
    const first = await saveFamilyData(db, {
      familyId: family.id,
      data: familyData({ composition: { adults: 2, youngWithCondition: 0, youngWithoutCondition: 2 } }),
      actor,
    })
    expect(first.cardsCreated).toBe(3)
    expect(first.family.formSubmittedAt).toBeInstanceOf(Date)
    const own = await ownFamilyMembers(db, family.id)
    expect(own.members.map(member => [member.kind, member.firstName])).toEqual([
      ['adult', 'Anna'],
      ['adult', null],
      ['young', null],
      ['young', null],
    ])
    const home = await familyHome(db, { userId: actor.userId, firstName: 'Anna', familyId: family.id })
    expect(home).toMatchObject({ memberCount: 4, cardsToComplete: 3 })

    // Saving again creates only what is missing, and the date of the first confirmation stays.
    const again = await saveFamilyData(db, {
      familyId: family.id,
      data: familyData({ composition: { adults: 3, youngWithCondition: 0, youngWithoutCondition: 2 } }),
      actor,
    })
    expect(again.cardsCreated).toBe(1)
    expect(again.family.formSubmittedAt).toEqual(first.family.formSubmittedAt)
    expect(await auditRows('family.form_submit')).toHaveLength(1)

    // Fewer people than cards: a person goes away by removing the card.
    await expect(
      saveFamilyData(db, {
        familyId: family.id,
        data: familyData({ composition: { adults: 2, youngWithCondition: 0, youngWithoutCondition: 2 } }),
        actor,
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect((await familyProfile(db, again.family)).cards).toEqual({
      adults: 3,
      youngWithCondition: 0,
      youngWithoutCondition: 2,
    })
  })

  it('needs the health consent to declare a young person with a condition, and gives it with the form', async () => {
    const { family, actor } = await familyWithReferent()
    const data = familyData({ composition: { adults: 1, youngWithCondition: 1, youngWithoutCondition: 0 } })
    await expect(saveFamilyData(db, { familyId: family.id, data, actor })).rejects.toMatchObject({
      statusCode: 400,
      data: { missing: ['healthConsent'] },
    })
    expect((await ownFamilyMembers(db, family.id)).members).toHaveLength(1)

    const saved = await saveFamilyData(db, { familyId: family.id, data: { ...data, healthConsent: true }, actor })
    expect(saved.cardsCreated).toBe(1)
    expect(saved.family.healthDataConsentAt).toBeInstanceOf(Date)
    const card = (await ownFamilyMembers(db, family.id)).members[1]!
    expect(card).toMatchObject({ kind: 'young', firstName: null, health: { hasDisability: true } })
    expect(await auditRows('family.health_consent')).toHaveLength(1)
    expect(await auditRows('member.health_update')).toHaveLength(1)

    // Withdrawing the consent deletes the health data: the card stays, without the condition.
    await setHealthConsent(db, { familyId: family.id, given: false, actor })
    const [row] = await db.select().from(t.families).where(eq(t.families.id, family.id))
    expect((await familyProfile(db, row!)).cards).toEqual({
      adults: 1,
      youngWithCondition: 0,
      youngWithoutCondition: 1,
    })
  })
})

describe('administration', () => {
  it('lists families with filters and never with health details', async () => {
    const rossi = await familyWithReferent({ name: 'Famiglia Rossi', city: 'Taranto', province: 'TA' })
    await setHealthConsent(db, { familyId: rossi.family.id, given: true, actor: rossi.actor })
    await addFamilyMember(db, {
      familyId: rossi.family.id,
      member: child({ firstName: 'Matteo', lastName: 'Rossi', health: withDisability }),
      actor: rossi.actor,
    })
    const bianchi = await familyWithReferent({ name: 'Famiglia Bianchi', city: 'Bari', province: 'BA' })
    await saveFamilyData(db, {
      familyId: bianchi.family.id,
      data: familyData({
        name: 'Famiglia Bianchi',
        city: 'Bari',
        province: 'BA',
        composition: { adults: 1, youngWithCondition: 0, youngWithoutCondition: 0 },
      }),
      actor: bianchi.actor,
    })
    const session = await makeSession(db, {
      title: 'Sessione di luglio',
      startDate: '2027-07-05',
      endDate: '2027-07-11',
    })
    const older = await makeSession(db, { title: 'Sessione di giugno', startDate: '2027-06-01', endDate: '2027-06-07' })
    await db.insert(t.sessionFamilies).values([
      { sessionId: older.id, familyId: rossi.family.id, kind: 'slot', status: 'confirmed' },
      { sessionId: session.id, familyId: rossi.family.id, kind: 'reserve', reserveRank: 1, status: 'selected' },
    ])

    const query = (values: Record<string, string> = {}) => adminFamilyListQuerySchema.parse(values)
    const all = await listFamilies(db, query())
    expect(all.total).toBe(2)
    expect(all.items.map(item => item.name)).toEqual(['Famiglia Bianchi', 'Famiglia Rossi'])
    expect(all.provinces).toEqual(['BA', 'TA'])
    const rossiItem = all.items.find(item => item.id === rossi.family.id)!
    expect(rossiItem.memberCount).toBe(2)
    expect(rossiItem.lastSession).toMatchObject({ title: 'Sessione di luglio', kind: 'reserve' })
    expect(JSON.stringify(all)).not.toMatch(/Descrizione riservata|hasDisability|disability/)

    expect((await listFamilies(db, query({ disability: 'yes' }))).items.map(i => i.id)).toEqual([rossi.family.id])
    expect((await listFamilies(db, query({ disability: 'no' }))).items.map(i => i.id)).toEqual([bianchi.family.id])
    expect((await listFamilies(db, query({ formStatus: 'submitted' }))).items.map(i => i.id)).toEqual([
      bianchi.family.id,
    ])
    expect((await listFamilies(db, query({ province: 'ta' }))).items.map(i => i.id)).toEqual([rossi.family.id])
    expect((await listFamilies(db, query({ q: 'matteo ross' }))).items.map(i => i.id)).toEqual([rossi.family.id])
    expect((await listFamilies(db, query({ q: '100%' }))).total).toBe(0)
    const sorted = await listFamilies(db, query({ sort: 'members', order: 'desc' }))
    expect(sorted.items[0]!.id).toBe(rossi.family.id)
    const paged = await listFamilies(db, query({ pageSize: '1', page: '2' }))
    expect(paged.items.map(i => i.name)).toEqual(['Famiglia Rossi'])
    expect(paged.total).toBe(2)
  })

  it('keeps health details out of the record and in the reserved endpoint only', async () => {
    const { family, actor } = await familyWithReferent()
    await setHealthConsent(db, { familyId: family.id, given: true, actor })
    const member = await addFamilyMember(db, { familyId: family.id, member: child({ health: withDisability }), actor })
    const detail = await adminFamilyDetail(db, family.id)
    expect(detail.members).toHaveLength(2)
    expect(JSON.stringify(detail)).not.toMatch(/Descrizione riservata|hasDisability/)
    const health = await adminFamilyHealth(db, family.id)
    expect(health.members.find(m => m.id === member.id)).toMatchObject({ hasDisability: true })
    await expect(adminFamilyDetail(db, crypto.randomUUID())).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('family data edited by the administration', () => {
  it('saves the data and audits the names of the changed fields', async () => {
    const { family } = await familyWithReferent({ name: 'Famiglia Verdi', city: 'Bari', address: 'Via Roma 1' })
    const admin = await makeAdmin(db)
    const row = await updateFamilyDataByAdmin(db, {
      familyId: family.id,
      data: { name: 'Famiglia Verdi', city: 'Lecce', province: 'LE', address: '' },
      actor: { userId: admin.id },
    })
    expect(row).toMatchObject({ name: 'Famiglia Verdi', city: 'Lecce', province: 'LE', address: null, phone: null })
    const [audit] = await auditRows('family.update_by_admin')
    expect(audit!.actorUserId).toBe(admin.id)
    expect(audit!.data).toEqual({ fields: ['address', 'city', 'province'] })
    await expect(
      updateFamilyDataByAdmin(db, { familyId: crypto.randomUUID(), data: { name: 'X' }, actor: { userId: admin.id } }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('family home', () => {
  it('counts what is left and shows only a confirmed upcoming session', async () => {
    const { user, family } = await familyWithReferent()
    const invited = await makeSession(db, { status: 'inviting', startDate: '2027-06-01', endDate: '2027-06-07' })
    const confirmed = await makeSession(db, { status: 'confirmed', startDate: '2027-07-01', endDate: '2027-07-07' })
    await db.insert(t.sessionFamilies).values([
      { sessionId: invited.id, familyId: family.id, kind: 'slot', status: 'invited' },
      { sessionId: confirmed.id, familyId: family.id, kind: 'slot', status: 'confirmed' },
    ])
    const document = await makeDocument(db)
    const archived = await makeDocument(db, { archivedAt: new Date() })
    await db.insert(t.signatureRequests).values([
      { documentId: document.id, userId: user.id },
      { documentId: archived.id, userId: user.id },
    ])

    const home = await familyHome(db, { userId: user.id, firstName: 'Anna', familyId: family.id, today: '2027-01-10' })
    expect(home).toMatchObject({ memberCount: 1, healthConsent: false, pendingSignatures: 1, formStatus: 'draft' })
    expect(home.nextSession?.id).toBe(confirmed.id)

    const later = await familyHome(db, { userId: user.id, firstName: 'Anna', familyId: family.id, today: '2027-07-08' })
    expect(later.nextSession).toBeNull()
  })
})
