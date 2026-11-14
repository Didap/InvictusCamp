import type { H3Event } from 'h3'
import { cardsChanged } from '../domain/releases'
import type { DbOrTx } from '../domain/db'

/**
 * After the cards or the data of a family change (family or administration): the age notice and the release
 * (server/domain/releases.ts). Returns the emails to deliver after the commit.
 */
export function familyChanged(
  tx: DbOrTx,
  event: H3Event,
  family: { id: string; ageNoticeAt: Date | null },
  actor: { userId: string; ip?: string | null },
) {
  return cardsChanged(tx, {
    familyId: family.id,
    ctx: emailContext(),
    uploadsDir: uploadsDir(),
    actor: { userId: actor.userId, ip: actor.ip ?? clientIp(event) },
    ageNoticeSent: Boolean(family.ageNoticeAt),
  })
}
