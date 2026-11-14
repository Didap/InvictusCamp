import type { DbOrTx } from '../domain/db'
import { guestAgeNotice } from '../domain/families'
import { familyRelease } from '../domain/releases'

/**
 * After the cards or the data of a family change (family or administration): the age notice, unless it already
 * left, and the release (server/domain/releases.ts). Returns the emails to deliver after the commit.
 */
export async function familyChanged(
  tx: DbOrTx,
  family: { id: string; ageNoticeAt: Date | null },
  actor: { userId: string; ip: string | null },
) {
  const ctx = emailContext()
  return [
    ...(family.ageNoticeAt ? [] : await guestAgeNotice(tx, { familyId: family.id, ctx })),
    ...(await familyRelease(tx, { familyId: family.id, ctx, uploadsDir: uploadsDir(), actor })),
  ]
}
