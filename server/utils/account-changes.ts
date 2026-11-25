import { eq } from 'drizzle-orm'
import type { DbOrTx } from '../domain/db'
import { familyRelease } from '../domain/releases'
import { staffSheetDocument } from '../domain/staff-sheets'

type Actor = { userId: string; ip: string | null }

/**
 * After the sheet of a staff member, or their name or phone, changes: the PDF of the sheet to sign
 * (server/domain/staff-sheets.ts). Returns the emails to deliver after the commit.
 */
export function staffSheetChanged(tx: DbOrTx, userId: string, actor: Actor) {
  return staffSheetDocument(tx, { userId, ctx: emailContext(), uploadsDir: uploadsDir(), actor })
}

/**
 * After an account's name or phone changes (/account): they are in the staff sheet, and the holder's name in the
 * family's release. Returns the emails to deliver after the commit.
 */
export async function accountChanged(tx: DbOrTx, user: { id: string; role: string }, actor: Actor) {
  if (user.role === 'staff') return staffSheetChanged(tx, user.id, actor)
  if (user.role !== 'family') return []
  const [family] = await tx
    .select({ id: tables.families.id })
    .from(tables.families)
    .where(eq(tables.families.userId, user.id))
  return family ? familyRelease(tx, { familyId: family.id, ctx: emailContext(), uploadsDir: uploadsDir(), actor }) : []
}
