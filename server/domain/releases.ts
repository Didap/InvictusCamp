// The release of a family (liberatoria, docs/spec.md 3.8): when every card is complete the camp prepares it
// with the members' data and the family's answers, and asks the family to sign it in Documenti. When the data
// changes, the release is made again and the old one archived (its pending signature cancelled). No health
// data in it. Explicit imports only, so the database tests can load it.
import { and, eq, isNull } from 'drizzle-orm'
import { releaseText } from '../../shared/content/release'
import { fullName, isCardToComplete } from '../../shared/utils/format'
import { documents, families } from '../db/schema'
import type { EmailContext, EmailMessage } from '../emails/types'
import { writeAudit } from './audit'
import { sha256 } from './crypto'
import type { DbOrTx } from './db'
import { cardChecks } from './families'
import { textPdf } from './pdf'
import { requestSignatures, signatureRequestEmails } from './signature-requests'
import { setDocumentArchived } from './signatures'
import { storeFile } from './storage'

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
  const { photoConsent, publicationConsent } = family.formAnswers
  const answered =
    family.formStatus === 'submitted' && typeof photoConsent === 'boolean' && typeof publicationConsent === 'boolean'
  if (!answered && !current) return []
  const cards = answered ? await cardChecks(db, family.id) : []
  const text =
    cards.length && !cards.some(isCardToComplete)
      ? releaseText({
          familyName: family.name,
          members: cards.map(card => ({
            name: fullName(card),
            birthDate: card.birthDate,
            relationship: card.relationship,
          })),
          photoConsent: photoConsent === true,
          publicationConsent: publicationConsent === true,
        })
      : null
  const digest = text && sha256(JSON.stringify(text))
  if (current && current.digest === digest) return []
  // The release in force no longer matches the family: it goes, and a new one comes once the data is complete.
  if (current) await setDocumentArchived(db, { documentId: current.id, archived: true, actor: input.actor })
  if (!text) return []

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
