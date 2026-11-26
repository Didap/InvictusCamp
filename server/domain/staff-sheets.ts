// The personal sheet of a staff or v-team member as a PDF to sign (docs/spec.md 3.4): once the sheet is complete
// the gestionale writes it with the account's details and asks the person to sign it in Documenti, with the code
// by email like every signature. When the data changes the PDF is made again and the old one archived (its pending
// signature cancelled), as the families' releases (releases.ts). No health data in it: allergies and the other
// details stay in the reserved section of the admin page. Explicit imports only, so the database tests can load it.
import { and, eq, isNull } from 'drizzle-orm'
import { staffSheetSchema, type StaffSheetInput } from '../../shared/schemas/staff'
import { inStaffArea } from '../../shared/utils/constants'
import { formatDay, formatTown, fullName } from '../../shared/utils/format'
import { documents, staffProfiles, users } from '../db/schema'
import type { EmailContext, EmailMessage } from '../emails/types'
import { writeAudit } from './audit'
import { sha256 } from './crypto'
import type { DbOrTx } from './db'
import { textPdf, type PdfBlock } from './pdf'
import { signatureRequestEmails } from './signature-requests'
import { createGeneratedDocument, setDocumentArchived } from './signatures'
import { staffSheetOf, type Actor } from './staff'

const PREPARED = 'Preparata dal gestionale con i dati della scheda personale.'

interface SheetInput {
  account: { firstName: string; lastName: string; email: string; phone: string | null }
  sheet: StaffSheetInput
}

/** The PDF: what the person filled in, and what the signature confirms. */
function sheetBlocks({ account, sheet }: SheetInput): PdfBlock[] {
  const field = (label: string, value: string): PdfBlock[] => [{ label }, value]
  return [
    { heading: 'Dati personali' },
    ...field('Nome e cognome', fullName(account)),
    ...field('Email', account.email),
    ...field('Telefono', account.phone ?? 'Non indicato'),
    ...field('Data di nascita', formatDay(sheet.birthDate, 'long')),
    ...field('Luogo di nascita', sheet.birthPlace),
    ...field('Codice fiscale', sheet.fiscalCode),
    { heading: 'Residenza' },
    ...field('Indirizzo', sheet.address),
    ...field('Città', formatTown({ ...sheet, province: sheet.province ?? null })),
    ...field('Regione', sheet.region),
    { heading: 'Divisa' },
    ...field('Taglia della maglietta', sheet.shirtSize),
    { heading: 'Dichiarazione' },
    'Con la firma confermo che i dati di questa scheda sono corretti e aggiornati.',
  ]
}

/**
 * Prepares (or redoes) the PDF of the sheet once it is complete and the person is in the staff area; returns the
 * email asking to sign it. A PDF in force stays while the data is the same, signed or not. Called after the sheet
 * or the account (name, phone) is saved.
 */
export async function staffSheetDocument(
  db: DbOrTx,
  input: { userId: string; ctx: EmailContext; uploadsDir: string; actor: Actor },
): Promise<EmailMessage[]> {
  // The account's row locked: a save of the sheet and one of the account at once would both see the PDF in
  // force and both make a new one; the second one waits and reads what the first one saved.
  const [row] = await db
    .select({
      profile: staffProfiles,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
    })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .where(eq(staffProfiles.userId, input.userId))
    .for('update', { of: users })
  if (!row) return []
  const { profile, ...account } = row
  const [current] = await db
    .select({ id: documents.id, digest: documents.sourceDigest })
    .from(documents)
    .where(and(eq(documents.staffUserId, input.userId), isNull(documents.archivedAt)))
  const parsed = inStaffArea(profile.status) ? staffSheetSchema.safeParse(staffSheetOf(profile)) : null
  const data: SheetInput | null = parsed?.success ? { account, sheet: parsed.data } : null
  const source = data && { data, digest: sha256(JSON.stringify(data)) }
  if (current?.digest === source?.digest) return []
  // The PDF in force no longer matches the sheet: it goes, and a new one comes while the sheet is complete.
  if (current) await setDocumentArchived(db, { documentId: current.id, archived: true, actor: input.actor })
  if (!source) return []

  const title = `Scheda personale · ${fullName(account)}`
  const { documentId, requestIds } = await createGeneratedDocument(db, input.uploadsDir, {
    owner: { staffUserId: input.userId },
    signerId: input.userId,
    title,
    description: PREPARED,
    category: 'other',
    pdf: await textPdf(title, sheetBlocks(source.data), PREPARED),
    sourceDigest: source.digest,
  })
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'staff.sheet_document',
    entityType: 'user',
    entityId: input.userId,
    data: { documentId, replaced: current?.id ?? null },
    ip: input.actor.ip ?? null,
  })
  return signatureRequestEmails(db, input.ctx, requestIds)
}
