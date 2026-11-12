// The families area (A3): the family's data and questionnaire, its members and their health details
// (special category data: entered only after the explicit consent, every change audited as
// `member.health_update` with the names of the fields, never their values), its personal documents,
// and the administration's list and record. Explicit imports only, so the database tests can load it.
import {
  and,
  asc,
  count,
  type AnyColumn,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  ne,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import {
  HEALTH_DOCUMENT_CATEGORIES,
  hasHealthData,
  healthChangedFields,
  isHealthDocument,
  COMPOSITION_GROUPS,
  compositionGroupOf,
  countCards,
  MAX_MEMBERS_OF_A_KIND,
  missingRequiredQuestions,
  NO_HEALTH,
  normalizeFormAnswers,
  normalizeHealth,
  type AdminFamilyListQuery,
  type FamilyComposition,
  type FamilyDataInput,
  type FamilyProfileInput,
  type MemberInput,
  type PersonalDocumentInput,
} from '../../shared/schemas/families'
import type { FileDto } from '../../shared/types/api'
import type {
  AdminFamilyDetail,
  AdminFamilyHealth,
  FamilyHomeDto,
  FamilyListItem,
  FamilyListResponse,
  FamilyMemberDto,
  FamilyMembersResponse,
  FamilyProfileDto,
  FamilySessionRef,
  HealthConsentResult,
  MemberHealth,
  OwnFamilyMember,
  PersonalDocumentDto,
} from '../../shared/types/families'
import type { ItalianRegion, ParticipationStatus } from '../../shared/utils/constants'
import { ageOn, todayIso } from '../../shared/utils/dates'
import { plural } from '../../shared/utils/format'
import {
  campSessions,
  documents,
  families,
  familyMembers,
  files,
  personalDocuments,
  sessionFamilies,
  signatureRequests,
  users,
} from '../db/schema'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { deleteStoredFile } from './storage'
import { createError } from './errors'

type FamilyRow = typeof families.$inferSelect
type MemberRow = typeof familyMembers.$inferSelect

/** Who acts and from where, for the audit log. */
export interface Actor {
  userId: string
  ip?: string | null
}

/** Participations that hold the family in a session. */
const ACTIVE_PARTICIPATION: ParticipationStatus[] = ['selected', 'invited', 'confirmed']

function notFound(message: string) {
  return createError({ statusCode: 404, message })
}

/** The family, or 404. `lock` holds the row until the transaction ends, so its cards change one save at a time. */
async function requireFamilyRow(db: DbOrTx, familyId: string, lock = false): Promise<FamilyRow> {
  const query = db.select().from(families).where(eq(families.id, familyId)).limit(1)
  const [family] = lock ? await query.for('update') : await query
  if (!family) throw notFound('Famiglia non trovata')
  return family
}

const iso = (value: Date | null) => value?.toISOString() ?? null

// ─── Family data and questionnaire ─────────────────────────────────────────────────────────────────

/** The family's own fields, as both the family and the administration see them. */
export function familyFields(family: FamilyRow) {
  return {
    id: family.id,
    name: family.name,
    address: family.address,
    city: family.city,
    postalCode: family.postalCode,
    province: family.province,
    region: family.region,
    phone: family.phone,
    formAnswers: family.formAnswers,
    formStatus: family.formStatus,
    formSubmittedAt: iso(family.formSubmittedAt),
  }
}

/** A card as the composition counts it (young people with a condition only with the consent), with its place. */
type CardRow = Pick<MemberRow, 'id' | 'kind' | 'hasDisability' | 'position'>

/** The family's cards: only what counting them and placing a new one needs, no names, no health details. */
function cardRows(db: DbOrTx, familyId: string): Promise<CardRow[]> {
  return db
    .select({
      id: familyMembers.id,
      kind: familyMembers.kind,
      hasDisability: familyMembers.hasDisability,
      position: familyMembers.position,
    })
    .from(familyMembers)
    .where(eq(familyMembers.familyId, familyId))
}

/** Where a new card goes: after the others. */
function nextPosition(rows: CardRow[]): number {
  return rows.reduce((next, row) => Math.max(next, row.position + 1), 0)
}

/** A group of the composition inside a sentence: "adulti", "ragazzi e ragazze senza patologie o disabilità". */
function groupName(key: keyof FamilyComposition): string {
  const { label } = COMPOSITION_GROUPS.find(group => group.key === key)!
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/**
 * 409 when `card` would make its group larger than the family data form can hold: past that, no
 * composition would be both allowed and at least the cards there, and the form could not be saved.
 */
function assertRoomFor(others: CardRow[], card: Pick<CardRow, 'kind' | 'hasDisability'>) {
  const group = compositionGroupOf(card)
  if (countCards(others)[group] >= MAX_MEMBERS_OF_A_KIND) {
    throw createError({
      statusCode: 409,
      message: `Al massimo ${MAX_MEMBERS_OF_A_KIND} schede di ${groupName(group)}`,
    })
  }
}

export function toFamilyProfile(family: FamilyRow, cards: FamilyComposition): FamilyProfileDto {
  return { ...familyFields(family), cards, healthDataConsentAt: iso(family.healthDataConsentAt) }
}

/** GET /api/family/profile */
export async function familyProfile(db: DbOrTx, family: FamilyRow): Promise<FamilyProfileDto> {
  return toFamilyProfile(family, countCards(await cardRows(db, family.id)))
}

/** Name, residence and phone as stored: empty values become null. */
function familyDataColumns(input: FamilyProfileInput) {
  return {
    name: input.name,
    address: input.address || null,
    city: input.city || null,
    postalCode: input.postalCode || null,
    province: input.province || null,
    region: input.region || null,
    phone: input.phone || null,
  }
}

const FAMILY_DATA_FIELDS = ['name', 'address', 'city', 'postalCode', 'province', 'region', 'phone'] as const

/** The administration changes the family's data on its behalf; the names of the changed fields are audited. */
export async function updateFamilyDataByAdmin(
  db: DbOrTx,
  input: { familyId: string; data: FamilyProfileInput; actor: Actor },
): Promise<FamilyRow> {
  const before = await requireFamilyRow(db, input.familyId)
  const [after] = await db
    .update(families)
    .set(familyDataColumns(input.data))
    .where(eq(families.id, before.id))
    .returning()
  const fields = FAMILY_DATA_FIELDS.filter(field => before[field] !== after![field])
  if (fields.length) {
    await writeAudit(db, {
      actorUserId: input.actor.userId,
      action: 'family.update_by_admin',
      entityType: 'family',
      entityId: input.familyId,
      data: { fields },
      ip: input.actor.ip,
    })
  }
  return after!
}

/**
 * Confirms the family data (docs/spec.md, 3.8): residence, composition, answers. Every save needs the
 * whole form; the first one marks the data confirmed. Then the family gets one card per person
 * declared: cards already there count (the account holder is the first adult), missing ones are
 * created empty, and a composition below the cards there is refused, since removing a person is
 * removing their card. Declaring a young person with a condition is health data: it needs the consent,
 * which the form gives (`healthConsent`) when the family has not given it yet. Afterwards the cards are
 * exactly the composition, returned as `cards`.
 */
export async function saveFamilyData(
  db: DbOrTx,
  input: { familyId: string; data: FamilyDataInput; actor: Actor },
): Promise<{ family: FamilyRow; cards: FamilyComposition; cardsCreated: number }> {
  // Locked: two saves at once (two tabs, a retry) would both count the same cards and both add the missing ones.
  const family = await requireFamilyRow(db, input.familyId, true)
  const { answers, invalid } = normalizeFormAnswers(input.data.answers)
  if (invalid.length) {
    throw createError({ statusCode: 400, message: `Risposta non valida alla domanda «${invalid[0]!.label}»` })
  }
  const missing = missingRequiredQuestions(answers)
  if (missing.length) {
    throw createError({
      statusCode: 400,
      message: `Rispondi alle domande obbligatorie: ${missing.map(question => `«${question.label}»`).join(', ')}`,
      data: { missing: missing.map(question => question.id) },
    })
  }

  const { composition } = input.data
  const rows = await cardRows(db, family.id)
  const cards = countCards(rows)
  for (const { key } of COMPOSITION_GROUPS) {
    if (composition[key] < cards[key]) {
      throw createError({
        statusCode: 409,
        message: `Hai già ${plural(cards[key], 'scheda', 'schede')} di ${groupName(key)}: per indicarne di meno, cambia o rimuovi una scheda nella pagina Componenti`,
      })
    }
  }
  if (composition.youngWithCondition > 0 && !family.healthDataConsentAt) {
    if (!input.data.healthConsent) {
      throw createError({
        statusCode: 400,
        message: 'Per indicare ragazzi o ragazze con patologie o disabilità serve il tuo consenso ai dati sulla salute',
        data: { missing: ['healthConsent'] },
      })
    }
    await setHealthConsent(db, { familyId: family.id, given: true, actor: input.actor })
  }

  const firstTime = family.formStatus !== 'submitted'
  const [row] = await db
    .update(families)
    .set({
      ...familyDataColumns(input.data),
      formAnswers: answers,
      formStatus: 'submitted',
      formSubmittedAt: family.formSubmittedAt ?? new Date(),
    })
    .where(eq(families.id, family.id))
    .returning()

  const created = await createCards(db, family.id, composition, cards, nextPosition(rows))
  for (const card of created) {
    if (card.hasDisability) await auditHealth(db, input.actor, card, ['hasDisability'])
  }
  if (firstTime) {
    await writeAudit(db, {
      actorUserId: input.actor.userId,
      action: 'family.form_submit',
      entityType: 'family',
      entityId: family.id,
      data: { cardsCreated: created.length },
      ip: input.actor.ip,
    })
  }
  return { family: row!, cards: composition, cardsCreated: created.length }
}

/** The empty cards that bring the family from `cards` to `composition`, from `position` on. */
async function createCards(
  db: DbOrTx,
  familyId: string,
  composition: FamilyComposition,
  cards: FamilyComposition,
  position: number,
): Promise<MemberRow[]> {
  const values = COMPOSITION_GROUPS.flatMap(group =>
    Array.from({ length: composition[group.key] - cards[group.key] }, () => ({
      familyId,
      kind: group.kind,
      hasDisability: group.hasDisability,
      position: position++,
    })),
  )
  return values.length ? db.insert(familyMembers).values(values).returning() : []
}

// ─── Members ───────────────────────────────────────────────────────────────────────────────────────

function toMember(row: MemberRow): FamilyMemberDto {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate,
    relationship: row.relationship,
    kind: row.kind,
    isReferent: row.isReferent,
  }
}

function healthOf(row: Pick<MemberRow, 'hasDisability' | 'disability'>): MemberHealth {
  return { hasDisability: row.hasDisability, disability: row.disability ?? null }
}

function listMemberRows(db: DbOrTx, familyId: string): Promise<MemberRow[]> {
  return db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.familyId, familyId))
    .orderBy(asc(familyMembers.position), asc(familyMembers.createdAt))
}

/** A member of this family, or 404 (a member of another family is never found). */
export async function requireFamilyMember(db: DbOrTx, familyId: string, memberId: string): Promise<MemberRow> {
  const [row] = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.familyId, familyId)))
    .limit(1)
  if (!row) throw notFound('Componente non trovato')
  return row
}

/** The certificates and diagnoses the family uploaded (health data, like the members' details). */
function healthDocumentsOf(userId: string): SQL | undefined {
  return and(eq(personalDocuments.userId, userId), inArray(personalDocuments.category, HEALTH_DOCUMENT_CATEGORIES))
}

/** The family's own members; health details only while the consent is given. */
export async function ownFamilyMembers(db: DbOrTx, familyId: string): Promise<FamilyMembersResponse> {
  const family = await requireFamilyRow(db, familyId)
  const consent = Boolean(family.healthDataConsentAt)
  const rows = await listMemberRows(db, familyId)
  const [uploaded] = await db.select({ total: count() }).from(personalDocuments).where(healthDocumentsOf(family.userId))
  return {
    formStatus: family.formStatus,
    healthDataConsentAt: iso(family.healthDataConsentAt),
    healthDocuments: uploaded?.total ?? 0,
    members: rows.map(row => ({ ...toMember(row), health: consent ? healthOf(row) : null })),
  }
}

function consentRequired() {
  return createError({
    statusCode: 403,
    message: 'Per indicare i dati sulla salute serve prima il tuo consenso: lo trovi nella pagina Componenti',
  })
}

async function auditHealth(
  db: DbOrTx,
  actor: Actor,
  member: { id: string; familyId: string },
  fields: string[],
  reason?: 'member_removed' | 'consent_withdrawn',
) {
  if (!fields.length) return
  await writeAudit(db, {
    actorUserId: actor.userId,
    action: 'member.health_update',
    entityType: 'family_member',
    entityId: member.id,
    data: { familyId: member.familyId, fields, ...(reason ? { reason } : {}) },
    ip: actor.ip,
  })
}

/** 409 unless another member of the family is a referent. */
async function requireAnotherReferent(db: DbOrTx, familyId: string, memberId: string, message: string) {
  const [other] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(eq(familyMembers.familyId, familyId), eq(familyMembers.isReferent, true), ne(familyMembers.id, memberId)),
    )
    .limit(1)
  if (!other) throw createError({ statusCode: 409, message })
}

function ownMember(row: MemberRow, consent: boolean): OwnFamilyMember {
  return { ...toMember(row), health: consent ? healthOf(row) : null }
}

export async function addFamilyMember(
  db: DbOrTx,
  input: { familyId: string; member: MemberInput; actor: Actor },
): Promise<OwnFamilyMember> {
  const family = await requireFamilyRow(db, input.familyId, true)
  // The cards come from the family data: until it is confirmed, the account holder's is the only one.
  if (family.formStatus !== 'submitted') {
    throw createError({
      statusCode: 409,
      message: 'Prima conferma i dati della famiglia: creiamo noi una scheda per ogni persona',
    })
  }
  const health = normalizeHealth(input.member.health)
  if (hasHealthData(health) && !family.healthDataConsentAt) throw consentRequired()
  const rows = await cardRows(db, family.id)
  assertRoomFor(rows, { kind: input.member.kind, hasDisability: health.hasDisability })
  const [row] = await db
    .insert(familyMembers)
    .values({
      familyId: family.id,
      firstName: input.member.firstName,
      lastName: input.member.lastName,
      birthDate: input.member.birthDate ?? null,
      relationship: input.member.relationship,
      kind: input.member.kind,
      isReferent: input.member.isReferent,
      hasDisability: health.hasDisability,
      disability: health.disability,
      position: nextPosition(rows),
    })
    .returning()
  await auditHealth(db, input.actor, row!, healthChangedFields(NO_HEALTH, health))
  return ownMember(row!, Boolean(family.healthDataConsentAt))
}

/** Replaces the member's data; the health details change only when `health` is given. */
export async function updateFamilyMember(
  db: DbOrTx,
  input: { familyId: string; memberId: string; member: MemberInput; actor: Actor },
): Promise<OwnFamilyMember> {
  const family = await requireFamilyRow(db, input.familyId)
  const row = await requireFamilyMember(db, family.id, input.memberId)
  const before = healthOf(row)
  let after = before
  if (input.member.health !== undefined) {
    const next = normalizeHealth(input.member.health)
    if (family.healthDataConsentAt) after = next
    else if (hasHealthData(next)) throw consentRequired()
  }
  const card = { kind: input.member.kind, hasDisability: after.hasDisability }
  if (compositionGroupOf(card) !== compositionGroupOf(row)) {
    const others = (await cardRows(db, family.id)).filter(other => other.id !== row.id)
    assertRoomFor(others, card)
  }
  if (row.isReferent && !input.member.isReferent) {
    await requireAnotherReferent(
      db,
      family.id,
      row.id,
      'Serve almeno una persona di riferimento: indica prima un altro componente come referente',
    )
  }
  const [updated] = await db
    .update(familyMembers)
    .set({
      firstName: input.member.firstName,
      lastName: input.member.lastName,
      birthDate: input.member.birthDate ?? null,
      relationship: input.member.relationship,
      kind: input.member.kind,
      isReferent: input.member.isReferent,
      hasDisability: after.hasDisability,
      disability: after.disability,
    })
    .where(eq(familyMembers.id, row.id))
    .returning()
  await auditHealth(db, input.actor, row, healthChangedFields(before, after))
  return ownMember(updated!, Boolean(family.healthDataConsentAt))
}

export async function removeFamilyMember(
  db: DbOrTx,
  input: { familyId: string; memberId: string; actor: Actor },
): Promise<void> {
  const row = await requireFamilyMember(db, input.familyId, input.memberId)
  if (row.isReferent) {
    await requireAnotherReferent(
      db,
      input.familyId,
      row.id,
      'Non puoi rimuovere l’unica persona di riferimento: indica prima un altro componente come referente',
    )
  }
  await db.delete(familyMembers).where(eq(familyMembers.id, row.id))
  await auditHealth(db, input.actor, row, healthChangedFields(healthOf(row), NO_HEALTH), 'member_removed')
}

/**
 * Gives or withdraws the consent to the processing of health data (GDPR art. 9). Withdrawing deletes
 * the health details of every member and the certificates and diagnoses uploaded, so nothing stays
 * behind: their records go now, their bytes after the commit (`storageKeys`, removeStoredBytes).
 */
export async function setHealthConsent(
  db: DbOrTx,
  input: { familyId: string; given: boolean; actor: Actor },
): Promise<HealthConsentResult & { storageKeys: string[] }> {
  const family = await requireFamilyRow(db, input.familyId)
  if (input.given) {
    if (family.healthDataConsentAt) {
      return { healthDataConsentAt: iso(family.healthDataConsentAt), cleared: 0, documentsRemoved: 0, storageKeys: [] }
    }
    const now = new Date()
    await db.update(families).set({ healthDataConsentAt: now }).where(eq(families.id, family.id))
    await writeAudit(db, {
      actorUserId: input.actor.userId,
      action: 'family.health_consent',
      entityType: 'family',
      entityId: family.id,
      data: { given: true },
      ip: input.actor.ip,
    })
    return { healthDataConsentAt: now.toISOString(), cleared: 0, documentsRemoved: 0, storageKeys: [] }
  }

  const withHealth = (await listMemberRows(db, family.id)).filter(row => hasHealthData(healthOf(row)))
  if (withHealth.length) {
    await db
      .update(familyMembers)
      .set({ hasDisability: false, disability: null })
      .where(
        inArray(
          familyMembers.id,
          withHealth.map(row => row.id),
        ),
      )
    for (const row of withHealth) {
      await auditHealth(db, input.actor, row, healthChangedFields(healthOf(row), NO_HEALTH), 'consent_withdrawn')
    }
  }
  // Deleting the file record deletes the personal document with it (cascade).
  const removed = await db
    .delete(files)
    .where(
      inArray(
        files.id,
        db.select({ id: personalDocuments.fileId }).from(personalDocuments).where(healthDocumentsOf(family.userId)),
      ),
    )
    .returning({ storageKey: files.storageKey })
  if (family.healthDataConsentAt || removed.length) {
    await db.update(families).set({ healthDataConsentAt: null }).where(eq(families.id, family.id))
    await writeAudit(db, {
      actorUserId: input.actor.userId,
      action: 'family.health_consent',
      entityType: 'family',
      entityId: family.id,
      data: { given: false, cleared: withHealth.length, documentsRemoved: removed.length },
      ip: input.actor.ip,
    })
  }
  return {
    healthDataConsentAt: null,
    cleared: withHealth.length,
    documentsRemoved: removed.length,
    storageKeys: removed.map(row => row.storageKey),
  }
}

// ─── Personal documents ────────────────────────────────────────────────────────────────────────────

function toFileDto(
  file: Pick<typeof files.$inferSelect, 'id' | 'originalName' | 'mimeType' | 'sizeBytes' | 'createdAt'>,
): FileDto {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt.toISOString(),
  }
}

/** The personal documents of one account, newest first. */
export async function listPersonalDocuments(db: DbOrTx, userId: string): Promise<PersonalDocumentDto[]> {
  const rows = await db
    .select({
      id: personalDocuments.id,
      category: personalDocuments.category,
      title: personalDocuments.title,
      createdAt: personalDocuments.createdAt,
      file: {
        id: files.id,
        originalName: files.originalName,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        createdAt: files.createdAt,
      },
      memberId: familyMembers.id,
      memberFirstName: familyMembers.firstName,
      memberLastName: familyMembers.lastName,
    })
    .from(personalDocuments)
    .innerJoin(files, eq(files.id, personalDocuments.fileId))
    .leftJoin(familyMembers, eq(familyMembers.id, personalDocuments.familyMemberId))
    .where(eq(personalDocuments.userId, userId))
    .orderBy(desc(personalDocuments.createdAt))
  return rows.map(row => ({
    id: row.id,
    category: row.category,
    title: row.title,
    member:
      row.memberId && row.memberFirstName !== null && row.memberLastName !== null
        ? { id: row.memberId, firstName: row.memberFirstName, lastName: row.memberLastName }
        : null,
    file: toFileDto(row.file),
    createdAt: row.createdAt.toISOString(),
  }))
}

/**
 * What a family may upload: certificates and diagnoses only with the consent to health data, and only
 * about one of its own members. Checked before the file is stored, and again when it is recorded.
 */
export async function assertPersonalDocument(
  db: DbOrTx,
  familyId: string,
  document: PersonalDocumentInput,
): Promise<void> {
  if (isHealthDocument(document.category) && !(await requireFamilyRow(db, familyId)).healthDataConsentAt) {
    throw createError({
      statusCode: 400,
      message:
        'Per caricare certificati medici e diagnosi serve il consenso ai dati sulla salute: puoi darlo in fondo alla pagina Componenti',
    })
  }
  if (document.familyMemberId) await requireFamilyMember(db, familyId, document.familyMemberId)
}

/** Records an uploaded file as a personal document of the family (assertPersonalDocument). */
export async function addPersonalDocument(
  db: DbOrTx,
  input: { familyId: string; userId: string; document: PersonalDocumentInput; fileId: string; uploadedBy: string },
): Promise<{ id: string }> {
  await assertPersonalDocument(db, input.familyId, input.document)
  const [row] = await db
    .insert(personalDocuments)
    .values({
      userId: input.userId,
      familyMemberId: input.document.familyMemberId ?? null,
      category: input.document.category,
      title: input.document.title,
      fileId: input.fileId,
      uploadedBy: input.uploadedBy,
    })
    .returning({ id: personalDocuments.id })
  return row!
}

/** Deletes a personal document of the account and its file (the row goes with the file). 404 otherwise. */
export async function removePersonalDocument(
  db: DbOrTx,
  uploadsDir: string,
  input: { userId: string; documentId: string },
): Promise<void> {
  const [document] = await db
    .select({ fileId: personalDocuments.fileId })
    .from(personalDocuments)
    .where(and(eq(personalDocuments.id, input.documentId), eq(personalDocuments.userId, input.userId)))
    .limit(1)
  if (!document) throw notFound('Documento non trovato')
  await deleteStoredFile(db, uploadsDir, document.fileId)
}

// ─── Family home ───────────────────────────────────────────────────────────────────────────────────

const sessionRefColumns = {
  id: campSessions.id,
  title: campSessions.title,
  startDate: campSessions.startDate,
  endDate: campSessions.endDate,
  location: campSessions.location,
  sessionStatus: campSessions.status,
  kind: sessionFamilies.kind,
  status: sessionFamilies.status,
}

/** What the family home needs: the greeting, the checklist, the next confirmed session. */
export async function familyHome(
  db: DbOrTx,
  input: { userId: string; firstName: string; familyId: string; today?: string },
): Promise<FamilyHomeDto> {
  const family = await requireFamilyRow(db, input.familyId)
  const [members] = await db
    .select({
      total: count(),
      // isCardToComplete: an empty card, or an adult without the birth date.
      toComplete: count(
        sql`case when ${familyMembers.firstName} is null or (${familyMembers.kind} = 'adult' and ${familyMembers.birthDate} is null) then 1 end`,
      ),
    })
    .from(familyMembers)
    .where(eq(familyMembers.familyId, family.id))
  const [signatures] = await db
    .select({ total: count() })
    .from(signatureRequests)
    .innerJoin(documents, eq(documents.id, signatureRequests.documentId))
    .where(
      and(
        eq(signatureRequests.userId, input.userId),
        eq(signatureRequests.status, 'pending'),
        isNull(documents.archivedAt),
      ),
    )
  // Families never see participations still `selected` (spec 3.3): only confirmed places here.
  const [next] = await db
    .select(sessionRefColumns)
    .from(sessionFamilies)
    .innerJoin(campSessions, eq(campSessions.id, sessionFamilies.sessionId))
    .where(
      and(
        eq(sessionFamilies.familyId, family.id),
        eq(sessionFamilies.status, 'confirmed'),
        inArray(campSessions.status, ['inviting', 'confirmed']),
        gte(campSessions.endDate, input.today ?? todayIso()),
      ),
    )
    .orderBy(asc(campSessions.startDate))
    .limit(1)
  return {
    firstName: input.firstName,
    familyName: family.name,
    formStatus: family.formStatus,
    memberCount: members?.total ?? 0,
    cardsToComplete: members?.toComplete ?? 0,
    healthConsent: Boolean(family.healthDataConsentAt),
    pendingSignatures: signatures?.total ?? 0,
    nextSession: next ?? null,
  }
}

// ─── Administration ────────────────────────────────────────────────────────────────────────────────

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`)
}

const memberCountSql = sql<number>`(select count(*)::int from ${familyMembers} where ${familyMembers.familyId} = ${families.id})`

/** The filters of the admin list (search, questionnaire, province, members with a disability). */
function familyListWhere(query: AdminFamilyListQuery): SQL | undefined {
  const conditions: SQL[] = []
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`
    conditions.push(
      or(
        sql`${families.name} ilike ${pattern}`,
        sql`${families.city} ilike ${pattern}`,
        sql`${users.email} ilike ${pattern}`,
        sql`(${users.firstName} || ' ' || ${users.lastName}) ilike ${pattern}`,
        sql`exists (select 1 from ${familyMembers} where ${familyMembers.familyId} = ${families.id} and (${familyMembers.firstName} || ' ' || ${familyMembers.lastName}) ilike ${pattern})`,
      )!,
    )
  }
  if (query.formStatus) conditions.push(eq(families.formStatus, query.formStatus))
  if (query.province) conditions.push(eq(families.province, query.province))
  if (query.region) conditions.push(eq(families.region, query.region))
  if (query.disability) {
    const withDisability = sql`exists (select 1 from ${familyMembers} where ${familyMembers.familyId} = ${families.id} and ${familyMembers.hasDisability})`
    conditions.push(query.disability === 'yes' ? withDisability : not(withDisability))
  }
  return conditions.length ? and(...conditions) : undefined
}

function familyListOrder(query: AdminFamilyListQuery): SQL[] {
  const direction = query.order === 'desc' ? desc : asc
  const column = {
    name: families.name,
    city: families.city,
    members: memberCountSql,
    createdAt: families.createdAt,
  }[query.sort]
  return [direction(column), asc(families.name), asc(families.id)]
}

/** The latest session (by start date) each family is in, selected, invited or confirmed. */
async function latestSessions(db: DbOrTx, familyIds: string[]): Promise<Map<string, FamilySessionRef>> {
  const latest = new Map<string, FamilySessionRef>()
  if (!familyIds.length) return latest
  const rows = await db
    .select({ familyId: sessionFamilies.familyId, ...sessionRefColumns })
    .from(sessionFamilies)
    .innerJoin(campSessions, eq(campSessions.id, sessionFamilies.sessionId))
    .where(and(inArray(sessionFamilies.familyId, familyIds), inArray(sessionFamilies.status, ACTIVE_PARTICIPATION)))
    .orderBy(desc(campSessions.startDate))
  for (const { familyId, ...session } of rows) if (!latest.has(familyId)) latest.set(familyId, session)
  return latest
}

/** The values in use in a column, sorted, in one aggregate (null when there is none). */
function distinctValues<T>(column: AnyColumn) {
  return sql<T[] | null>`array_agg(distinct ${column} order by ${column}) filter (where ${column} is not null)`
}

/** GET /api/admin/families: one page of families, without any health detail. */
export async function listFamilies(db: DbOrTx, query: AdminFamilyListQuery): Promise<FamilyListResponse> {
  const where = familyListWhere(query)
  const [rows, [total], [choices]] = await Promise.all([
    db
      .select({
        id: families.id,
        name: families.name,
        city: families.city,
        province: families.province,
        region: families.region,
        formStatus: families.formStatus,
        formSubmittedAt: families.formSubmittedAt,
        createdAt: families.createdAt,
        memberCount: memberCountSql,
        referent: {
          userId: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          status: users.status,
        },
      })
      .from(families)
      .innerJoin(users, eq(users.id, families.userId))
      .where(where)
      .orderBy(...familyListOrder(query))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(families).innerJoin(users, eq(users.id, families.userId)).where(where),
    // The choices of the filters: every province and region in use, whatever the filters.
    db
      .select({
        provinces: distinctValues<string>(families.province),
        regions: distinctValues<ItalianRegion>(families.region),
      })
      .from(families),
  ])
  const familyIds = rows.map(row => row.id)
  const [latest, ages] = await Promise.all([latestSessions(db, familyIds), fragileAges(db, familyIds)])
  const items: FamilyListItem[] = rows.map(row => ({
    ...row,
    formSubmittedAt: iso(row.formSubmittedAt),
    createdAt: row.createdAt.toISOString(),
    lastSession: latest.get(row.id) ?? null,
    fragileAges: ages.get(row.id) ?? [],
  }))
  return {
    items,
    total: total?.value ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    provinces: choices?.provinces ?? [],
    regions: choices?.regions ?? [],
  }
}

/** For each family, the ages of its members with a condition (null without a birth date). */
async function fragileAges(db: DbOrTx, familyIds: string[]): Promise<Map<string, (number | null)[]>> {
  const ages = new Map<string, (number | null)[]>()
  if (!familyIds.length) return ages
  const today = todayIso()
  const rows = await db
    .select({ familyId: familyMembers.familyId, birthDate: familyMembers.birthDate })
    .from(familyMembers)
    .where(and(inArray(familyMembers.familyId, familyIds), eq(familyMembers.hasDisability, true)))
  for (const { familyId, birthDate } of rows) {
    const list = ages.get(familyId) ?? []
    list.push(birthDate ? ageOn(birthDate, today) : null)
    ages.set(familyId, list)
  }
  return ages
}

/** The rows of the CSV export: every family matching the filters, contacts included, no health details. */
export async function familiesForExport(db: DbOrTx, query: AdminFamilyListQuery) {
  return db
    .select({
      name: families.name,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: sql<string | null>`coalesce(${families.phone}, ${users.phone})`,
      address: families.address,
      postalCode: families.postalCode,
      city: families.city,
      province: families.province,
      region: families.region,
      memberCount: memberCountSql,
      formStatus: families.formStatus,
      formSubmittedAt: families.formSubmittedAt,
      createdAt: families.createdAt,
    })
    .from(families)
    .innerJoin(users, eq(users.id, families.userId))
    .where(familyListWhere(query))
    .orderBy(...familyListOrder(query))
}

/** GET /api/admin/families/:id: the record without health details. */
export async function adminFamilyDetail(db: DbOrTx, familyId: string): Promise<AdminFamilyDetail> {
  const [row] = await db
    .select({
      family: families,
      referent: {
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
        lastLoginAt: users.lastLoginAt,
      },
    })
    .from(families)
    .innerJoin(users, eq(users.id, families.userId))
    .where(eq(families.id, familyId))
    .limit(1)
  if (!row) throw notFound('Famiglia non trovata')
  const { family, referent } = row
  const members = await listMemberRows(db, family.id)
  const active = await db
    .select({ sessionId: sessionFamilies.sessionId })
    .from(sessionFamilies)
    .where(and(eq(sessionFamilies.familyId, family.id), inArray(sessionFamilies.status, ACTIVE_PARTICIPATION)))
  return {
    ...familyFields(family),
    privacyConsentAt: iso(family.privacyConsentAt),
    healthDataConsentAt: iso(family.healthDataConsentAt),
    adminNotes: family.adminNotes,
    createdAt: family.createdAt.toISOString(),
    referent: {
      ...referent,
      emailVerifiedAt: iso(referent.emailVerifiedAt),
      lastLoginAt: iso(referent.lastLoginAt),
    },
    members: members.map(toMember),
    documents: await listPersonalDocuments(db, family.userId),
    activeSessionIds: active.map(item => item.sessionId),
  }
}

/** GET /api/admin/families/:id/health: the reserved section; empty without the consent. */
export async function adminFamilyHealth(db: DbOrTx, familyId: string): Promise<AdminFamilyHealth> {
  const family = await requireFamilyRow(db, familyId)
  if (!family.healthDataConsentAt) return { healthDataConsentAt: null, members: [] }
  const rows = await listMemberRows(db, family.id)
  return {
    healthDataConsentAt: iso(family.healthDataConsentAt),
    members: rows.map(row => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      kind: row.kind,
      ...healthOf(row),
    })),
  }
}

/** Internal notes of the administration (empty clears them). */
export async function updateAdminNotes(db: DbOrTx, familyId: string, notes: string): Promise<string | null> {
  const [row] = await db
    .update(families)
    .set({ adminNotes: notes.trim() || null })
    .where(eq(families.id, familyId))
    .returning({ adminNotes: families.adminNotes })
  if (!row) throw notFound('Famiglia non trovata')
  return row.adminNotes
}
