// The release of a family (liberatoria, docs/spec.md 3.8): when every card is complete the camp prepares it
// with the members' data and the family's answers, in the text the administration keeps in release_texts
// (the draft of the code until the first save), and asks the family to sign it in Documenti. When the data
// or the text changes, the release is made again and the old one archived (its pending signature cancelled):
// at the family's next change, or for every family at once when the administration asks (renewReleases). No
// health data in it. Explicit imports only, so the database tests can load it.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { DEFAULT_RELEASE_TEXT, releaseText } from '../../shared/content/release'
import type { ReleaseTextSaveValues } from '../../shared/schemas/releases'
import type { ReleaseTextDto } from '../../shared/types/families'
import { fullName, isCardToComplete } from '../../shared/utils/format'
import { documents, families, familyMembers, releaseTexts, signatureRequests, users } from '../db/schema'
import type { EmailContext, EmailMessage } from '../emails/types'
import { writeAudit } from './audit'
import { sha256 } from './crypto'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import { CARD_CHECK_COLUMNS, cardChecks, type Actor } from './families'
import { textPdf } from './pdf'
import { requestSignatures, signatureRequestEmails } from './signature-requests'
import { setDocumentArchived } from './signatures'
import { storeFile } from './storage'

const FAMILY_RELEASE = 'family'

type ReleaseTextState = Omit<ReleaseTextDto, 'inForce' | 'outdated' | 'outdatedSigned'>
type Family = Pick<typeof families.$inferSelect, 'name' | 'formStatus' | 'formAnswers'>
type Card = Awaited<ReturnType<typeof cardChecks>>[number]

/** The text of the family release as it is now; `lock` holds its row until the commit (a save, a renewal). */
export async function getReleaseText(db: DbOrTx, lock = false): Promise<ReleaseTextState> {
  const query = db
    .select({
      body: releaseTexts.body,
      revision: releaseTexts.revision,
      updatedAt: releaseTexts.updatedAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(releaseTexts)
    .leftJoin(users, eq(users.id, releaseTexts.updatedBy))
    .where(eq(releaseTexts.key, FAMILY_RELEASE))
    .limit(1)
  const [row] = lock ? await query.for('update', { of: releaseTexts }) : await query
  if (!row) return { body: DEFAULT_RELEASE_TEXT, revision: 0, updatedAt: null, updatedByName: null }
  return {
    body: row.body,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: fullName(row) || null,
  }
}

/** The two answers of the «Liberatoria» section, once the family confirmed its data; otherwise null. */
function consents(family: Family) {
  const { photoConsent, publicationConsent } = family.formAnswers
  return family.formStatus === 'submitted' &&
    typeof photoConsent === 'boolean' &&
    typeof publicationConsent === 'boolean'
    ? { photoConsent, publicationConsent }
    : null
}

/** The release a family should have now with this text, or null while its data is not complete. */
function expectedRelease(body: string, family: Family, cards: Card[]) {
  const answers = consents(family)
  if (!answers || !cards.length || cards.some(isCardToComplete)) return null
  const referent = cards.find(card => card.isReferent) ?? cards[0]!
  const text = releaseText(body, {
    familyName: family.name,
    referent: fullName(referent),
    members: cards.map(card => ({ name: fullName(card), birthDate: card.birthDate, relationship: card.relationship })),
    ...answers,
  })
  return { text, digest: sha256(JSON.stringify(text)) }
}

/** Prepares (or redoes) the release once every card is complete; returns the email asking to sign it. */
export async function familyRelease(
  db: DbOrTx,
  input: { familyId: string; ctx: EmailContext; uploadsDir: string; actor: { userId: string; ip?: string | null } },
): Promise<EmailMessage[]> {
  // Locked: two saves at once would both see the release in force and both make a new one.
  const [family] = await db.select().from(families).where(eq(families.id, input.familyId)).for('update')
  if (!family) return []
  const [current] = await db
    .select({ id: documents.id, digest: documents.sourceDigest })
    .from(documents)
    .where(and(eq(documents.familyId, family.id), isNull(documents.archivedAt)))
  if (!consents(family) && !current) return []
  const { body, revision } = await getReleaseText(db)
  const release = expectedRelease(body, family, consents(family) ? await cardChecks(db, family.id) : [])
  if (current && current.digest === release?.digest) return []
  // The release in force no longer matches the family or the text: it goes, and a new one comes once the
  // data is complete.
  if (current) await setDocumentArchived(db, { documentId: current.id, archived: true, actor: input.actor })
  if (!release) return []

  const { text, digest } = release
  const file = await storeFile(db, input.uploadsDir, {
    data: await textPdf(
      text.title,
      text.paragraphs,
      revision
        ? 'Preparata dal gestionale con i dati dei componenti e le risposte della famiglia.'
        : 'Testo di esempio preparato dal gestionale con i dati dei componenti: il testo definitivo lo dà il camp.',
    ),
    originalName: `${text.title}.pdf`,
    mimeType: 'application/pdf',
    purpose: 'document',
    ownerUserId: family.userId,
  })
  const [document] = await db
    .insert(documents)
    .values({
      title: text.title,
      description: 'Preparata dal gestionale con i dati dei componenti e le risposte della famiglia.',
      category: 'consent',
      fileId: file.id,
      requiresSignature: true,
      familyId: family.id,
      sourceDigest: digest,
    })
    .returning({ id: documents.id })
  const requests = await requestSignatures(db, { documentId: document!.id, userIds: [family.userId] })
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'family.release',
    entityType: 'family',
    entityId: family.id,
    data: { documentId: document!.id, replaced: current?.id ?? null },
    ip: input.actor.ip ?? null,
  })
  return signatureRequestEmails(
    db,
    input.ctx,
    requests.map(request => request.id),
  )
}

/** The releases in force and, among them, those whose family would get another text now. */
async function releasesInForce(db: DbOrTx, body: string) {
  const releases = await db
    .select({
      familyId: families.id,
      digest: documents.sourceDigest,
      name: families.name,
      formStatus: families.formStatus,
      formAnswers: families.formAnswers,
      signed: sql<boolean>`exists (select 1 from ${signatureRequests} where ${signatureRequests.documentId} = ${documents.id} and ${signatureRequests.status} = 'signed')`,
    })
    .from(documents)
    .innerJoin(families, eq(families.id, documents.familyId))
    .where(isNull(documents.archivedAt))
  const cards = new Map<string, Card[]>()
  if (releases.length) {
    const rows = await db
      .select({ familyId: familyMembers.familyId, ...CARD_CHECK_COLUMNS })
      .from(familyMembers)
      .where(
        inArray(
          familyMembers.familyId,
          releases.map(release => release.familyId),
        ),
      )
      .orderBy(familyMembers.position)
    for (const { familyId, ...card } of rows) cards.set(familyId, [...(cards.get(familyId) ?? []), card])
  }
  const outdated = releases.filter(
    release => release.digest !== expectedRelease(body, release, cards.get(release.familyId) ?? [])?.digest,
  )
  return { inForce: releases.length, outdated }
}

/** The text with the state of the releases in force, for the editor. */
export async function releaseTextDto(db: DbOrTx): Promise<ReleaseTextDto> {
  const text = await getReleaseText(db)
  const { inForce, outdated } = await releasesInForce(db, text.body)
  return {
    ...text,
    inForce,
    outdated: outdated.length,
    outdatedSigned: outdated.filter(release => release.signed).length,
  }
}

/**
 * Saves the text: refused (409) when someone saved after it was loaded. The releases in force stay as they are
 * until the family's next change or a renewal.
 */
export async function saveReleaseText(
  db: DbOrTx,
  input: { values: ReleaseTextSaveValues; actor: Actor },
): Promise<ReleaseTextDto> {
  const current = await getReleaseText(db, true)
  const conflict = () =>
    new DomainError(
      409,
      'Qualcun altro ha salvato il testo mentre lo modificavi. Ricarica la pagina per vedere la sua versione.',
    )
  if (input.values.revision !== current.revision) throw conflict()
  const { body } = input.values
  const [row] =
    current.revision === 0
      ? await db
          .insert(releaseTexts)
          .values({ key: FAMILY_RELEASE, body, updatedBy: input.actor.userId })
          .onConflictDoNothing()
          .returning({ revision: releaseTexts.revision })
      : await db
          .update(releaseTexts)
          .set({ body, revision: sql`${releaseTexts.revision} + 1`, updatedBy: input.actor.userId })
          .where(and(eq(releaseTexts.key, FAMILY_RELEASE), eq(releaseTexts.revision, current.revision)))
          .returning({ revision: releaseTexts.revision })
  if (!row) throw conflict()
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'release_text.update',
    entityType: 'release_text',
    // The text before this save: the saved rows tell every version.
    data: { key: FAMILY_RELEASE, revision: row.revision, previous: current.body },
    ip: input.actor.ip,
  })
  return releaseTextDto(db)
}

/**
 * «Chiedi la firma sul nuovo testo»: every release in force written with another text is made again with this
 * one, signed or not, and its family asked to sign it. Refused (409) when the text changed since the
 * administration looked at it.
 */
export async function renewReleases(
  db: DbOrTx,
  input: { revision: number; ctx: EmailContext; uploadsDir: string; actor: Actor },
): Promise<{ renewed: number; emails: EmailMessage[] }> {
  const text = await getReleaseText(db, true)
  if (input.revision !== text.revision) {
    throw new DomainError(409, 'Il testo è cambiato mentre lo guardavi. Ricarica la pagina e riprova.')
  }
  const { outdated } = await releasesInForce(db, text.body)
  const emails: EmailMessage[] = []
  for (const { familyId } of outdated) {
    emails.push(
      ...(await familyRelease(db, { familyId, ctx: input.ctx, uploadsDir: input.uploadsDir, actor: input.actor })),
    )
  }
  return { renewed: outdated.length, emails }
}
