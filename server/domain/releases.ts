// The release of a family (liberatoria, docs/spec.md 3.8): when every card is complete the camp prepares it
// with the members' data and the family's answers, and asks the family to sign it in Documenti. When the data
// changes, the release is made again and the old one archived (its pending signature cancelled). No health
// data in it. Explicit imports only, so the database tests can load it.
import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { releaseText } from '../../shared/content/release'
import { fullName, isCardToComplete } from '../../shared/utils/format'
import { documents, families, familyMembers } from '../db/schema'
import type { EmailContext, EmailMessage } from '../emails/types'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { guestAgeNotice } from './families'
import { textPdf } from './pdf'
import { requestSignatures, signatureRequestEmails } from './signature-requests'
import { setDocumentArchived } from './signatures'
import { storeFile } from './storage'

interface CardsChangedInput {
  familyId: string
  ctx: EmailContext
  uploadsDir: string
  actor: { userId: string; ip?: string | null }
  /** The age notice already left: no need to look again. */
  ageNoticeSent: boolean
}

/** After the cards or the family data change: the age notice and the release, as their rules say. */
export async function cardsChanged(db: DbOrTx, input: CardsChangedInput): Promise<EmailMessage[]> {
  return [
    ...(input.ageNoticeSent ? [] : await guestAgeNotice(db, { familyId: input.familyId, ctx: input.ctx })),
    ...(await familyRelease(db, input)),
  ]
}

/** Prepares (or redoes) the release once every card is complete; returns the email asking to sign it. */
export async function familyRelease(
  db: DbOrTx,
  input: Omit<CardsChangedInput, 'ageNoticeSent'>,
): Promise<EmailMessage[]> {
  // Locked: two saves at once would both see the old digest and both make a release.
  const [family] = await db.select().from(families).where(eq(families.id, input.familyId)).for('update')
  const [cards, [current]] = await Promise.all([
    db
      .select({
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
        kind: familyMembers.kind,
        birthDate: familyMembers.birthDate,
        relationship: familyMembers.relationship,
        hasDisability: familyMembers.hasDisability,
      })
      .from(familyMembers)
      .where(eq(familyMembers.familyId, input.familyId))
      .orderBy(familyMembers.position),
    db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.familyId, input.familyId), isNull(documents.archivedAt))),
  ])
  if (!family) return []
  const { photoConsent, publicationConsent } = family.formAnswers
  const ready =
    family.formStatus === 'submitted' &&
    cards.length > 0 &&
    !cards.some(isCardToComplete) &&
    typeof photoConsent === 'boolean' &&
    typeof publicationConsent === 'boolean'
  const text = ready
    ? releaseText({
        familyName: family.name,
        members: cards.map(card => ({
          name: fullName(card),
          birthDate: card.birthDate,
          relationship: card.relationship,
        })),
        photoConsent,
        publicationConsent,
      })
    : null
  const digest = text && createHash('sha256').update(JSON.stringify(text)).digest('hex')
  if (current && family.releaseDigest === digest) return []
  // The release in force no longer matches the family: it goes, and a new one comes once the data is complete.
  if (current) await setDocumentArchived(db, { documentId: current.id, archived: true, actor: input.actor })
  if (!text) {
    if (family.releaseDigest) await db.update(families).set({ releaseDigest: null }).where(eq(families.id, family.id))
    return []
  }
  const file = await storeFile(db, input.uploadsDir, {
    data: await textPdf(
      text.title,
      text.paragraphs,
      'Testo di esempio preparato dal gestionale con i dati dei componenti: il testo definitivo lo dà il camp.',
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
    })
    .returning({ id: documents.id })
  await db.update(families).set({ releaseDigest: digest }).where(eq(families.id, family.id))
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
