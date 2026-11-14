// The release of a family (liberatoria, docs/spec.md 3.8): when every card is complete the camp prepares it
// with the members' data and the family's answers, and asks the family to sign it in Documenti. When the data
// changes, the release is made again and the old one archived (its pending signature cancelled). No health
// data in it. Explicit imports only, so the database tests can load it.
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
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
  const [[family], cards] = await Promise.all([
    db.select().from(families).where(eq(families.id, input.familyId)),
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
  ])
  if (!family || family.formStatus !== 'submitted' || !cards.length || cards.some(isCardToComplete)) return []
  const text = releaseText({
    familyName: family.name,
    members: cards.map(card => ({ name: fullName(card), birthDate: card.birthDate, relationship: card.relationship })),
    photoConsent: family.formAnswers.photoConsent === true,
    publicationConsent: family.formAnswers.publicationConsent === true,
  })
  const digest = createHash('sha256').update(JSON.stringify(text)).digest('hex')
  if (family.releaseDigest === digest) return []

  if (family.releaseDocumentId) {
    await setDocumentArchived(db, { documentId: family.releaseDocumentId, archived: true, actor: input.actor })
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
    })
    .returning({ id: documents.id })
  await db
    .update(families)
    .set({ releaseDocumentId: document!.id, releaseDigest: digest })
    .where(eq(families.id, family.id))
  const requests = await requestSignatures(db, { documentId: document!.id, userIds: [family.userId] })
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'family.release',
    entityType: 'family',
    entityId: family.id,
    data: { documentId: document!.id, replaced: family.releaseDocumentId },
    ip: input.actor.ip ?? null,
  })
  return signatureRequestEmails(
    db,
    input.ctx,
    requests.map(request => request.id),
  )
}
