// The release of a family (liberatoria, docs/spec.md 3.8): when every card is complete the camp prepares it
// with the members' data and the family's answers, in the text the administration keeps in release_texts
// (the draft of the code until the first save), and asks the account holder to sign it in Documenti. When the
// data changes, the release is made again with the text in force and the old one archived (its pending
// signature cancelled). A new text alone changes nothing: the administration asks for it (renewReleases).
// No health data in it. Explicit imports only, so the database tests can load it.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { DEFAULT_RELEASE_TEXT, releaseText, type ReleaseInput } from '../../shared/content/release'
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
/** Keeps a save of the text and a renewal apart, also before the first save (no row to lock yet). */
const LOCK_KEY = sql`hashtext('release_text:family')`

type ReleaseTextState = Omit<ReleaseTextDto, 'inForce' | 'outdated' | 'outdatedSigned'>
type Family = Pick<typeof families.$inferSelect, 'name' | 'formStatus' | 'formAnswers'>
type Card = Awaited<ReturnType<typeof cardChecks>>[number]
/** The text releases are written with, and its digest: the draft has its own footer, so it counts. */
type Template = { body: string; revision: number; digest: string }

const templateOf = ({ body, revision }: { body: string; revision: number }): Template => ({
  body,
  revision,
  digest: sha256(JSON.stringify({ body, draft: !revision })),
})

/** The text of the family release as it is now; `lock` keeps saves and renewals apart until the commit. */
export async function getReleaseText(db: DbOrTx, lock = false): Promise<ReleaseTextState> {
  if (lock) await db.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`)
  const [row] = await db
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

/**
 * The release a family should have now, or null while its data is not complete. Its digest is the digest of
 * the data, a dot, the digest of the text: a family's change compares the first, a renewal the whole.
 */
function expectedRelease(template: Template, family: Family, referent: string, cards: Card[]) {
  const answers = consents(family)
  if (!answers || !cards.length || cards.some(isCardToComplete)) return null
  const input: ReleaseInput = {
    familyName: family.name,
    referent,
    members: cards.map(card => ({ name: fullName(card), birthDate: card.birthDate, relationship: card.relationship })),
    ...answers,
  }
  const data = sha256(JSON.stringify(input))
  return { text: releaseText(template.body, input), data, digest: `${data}.${template.digest}` }
}

/**
 * Prepares (or redoes) the release once every card is complete; returns the email asking to sign it. A
 * release in force stays while the family's data is the same, written with whatever text, unless `template`
 * comes from a renewal: then it stays only if it is written with that text too.
 */
export async function familyRelease(
  db: DbOrTx,
  input: {
    familyId: string
    ctx: EmailContext
    uploadsDir: string
    actor: { userId: string; ip?: string | null }
    renewWith?: Template
  },
): Promise<EmailMessage[]> {
  // Locked: two saves at once would both see the release in force and both make a new one.
  const [family] = await db.select().from(families).where(eq(families.id, input.familyId)).for('update')
  if (!family) return []
  const [current] = await db
    .select({ id: documents.id, digest: documents.sourceDigest })
    .from(documents)
    .where(and(eq(documents.familyId, family.id), isNull(documents.archivedAt)))
  const answered = consents(family) !== null
  if (!answered && !current) return []
  let release: ReturnType<typeof expectedRelease> = null
  const template = input.renewWith ?? templateOf(await getReleaseText(db))
  if (answered) {
    const [holder] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, family.userId))
    release = expectedRelease(template, family, fullName(holder!), await cardChecks(db, family.id))
  }
  const kept = input.renewWith ? release?.digest : release && `${release.data}.`
  if (current && kept && current.digest?.startsWith(kept)) return []
  // The release in force no longer matches the family: it goes, and a new one comes once the data is complete.
  if (current) await setDocumentArchived(db, { documentId: current.id, archived: true, actor: input.actor })
  if (!release) return []

  const { text, digest } = release
  const file = await storeFile(db, input.uploadsDir, {
    data: await textPdf(
      text.title,
      text.paragraphs,
      template.revision
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

/**
 * The releases in force, and among them those a renewal would write again: the family's data is complete and
 * the release is not written with this text (or no longer with its data).
 */
async function releasesInForce(db: DbOrTx, template: Template) {
  const releases = await db
    .select({
      familyId: families.id,
      digest: documents.sourceDigest,
      name: families.name,
      formStatus: families.formStatus,
      formAnswers: families.formAnswers,
      firstName: users.firstName,
      lastName: users.lastName,
      signed: sql<boolean>`exists (select 1 from ${signatureRequests} where ${signatureRequests.documentId} = ${documents.id} and ${signatureRequests.status} = 'signed')`,
    })
    .from(documents)
    .innerJoin(families, eq(families.id, documents.familyId))
    .innerJoin(users, eq(users.id, families.userId))
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
    for (const { familyId, ...card } of rows) {
      const list = cards.get(familyId)
      if (list) list.push(card)
      else cards.set(familyId, [card])
    }
  }
  const outdated = releases.filter(release => {
    const expected = expectedRelease(template, release, fullName(release), cards.get(release.familyId) ?? [])
    return expected !== null && expected.digest !== release.digest
  })
  return { inForce: releases.length, outdated }
}

/** The text with the state of the releases in force, for the editor. */
export async function releaseTextDto(db: DbOrTx): Promise<ReleaseTextDto> {
  const text = await getReleaseText(db)
  const { inForce, outdated } = await releasesInForce(db, templateOf(text))
  return {
    ...text,
    inForce,
    outdated: outdated.length,
    outdatedSigned: outdated.filter(release => release.signed).length,
  }
}

/**
 * Saves the text: refused (409) when someone saved after it was loaded. The releases in force stay as they are
 * until a renewal; a family whose data changes gets its new release with this text.
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
 * «Chiedi la firma sul nuovo testo»: every release in force not written with this text is made again with
 * it, signed or not, and the family asked to sign it. Refused (409) when the text changed since the
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
  const template = templateOf(text)
  const { outdated } = await releasesInForce(db, template)
  const emails: EmailMessage[] = []
  for (const { familyId } of outdated) {
    emails.push(...(await familyRelease(db, { ...input, familyId, renewWith: template })))
  }
  return { renewed: outdated.length, emails }
}
