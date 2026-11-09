// One-time tokens of the links sent by email. Only the SHA-256 is stored; the raw token travels in the
// email and nowhere else. A new token of the same purpose retires the older ones.
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { TokenPurpose } from '../../shared/utils/constants'
import { authTokens } from '../db/schema'
import { randomToken, sha256 } from './crypto'
import type { DbOrTx } from './db'

const HOUR = 60 * 60 * 1000

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  invite: 7 * 24 * HOUR,
  verify_email: 48 * HOUR,
  reset_password: 1 * HOUR,
}

/** Creates a token for `userId` and returns it (raw). */
export async function issueToken(db: DbOrTx, userId: string, purpose: TokenPurpose, now = new Date()): Promise<string> {
  await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)))
  const token = randomToken()
  await db.insert(authTokens).values({
    userId,
    purpose,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
  })
  return token
}

/** The user of a valid token (unused, not expired), without using it. */
export async function peekToken(
  db: DbOrTx,
  token: string,
  purpose: TokenPurpose,
  now = new Date(),
): Promise<string | null> {
  const [row] = await db
    .select({ userId: authTokens.userId })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .limit(1)
  return row?.userId ?? null
}

/** Uses a token once: its user, or null when the token is unknown, used or expired. */
export async function consumeToken(
  db: DbOrTx,
  token: string,
  purpose: TokenPurpose,
  now = new Date(),
): Promise<string | null> {
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .returning({ userId: authTokens.userId })
  return row?.userId ?? null
}
