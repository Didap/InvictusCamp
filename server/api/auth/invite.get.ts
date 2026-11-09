import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { zToken } from '#shared/schemas/common'
import type { InviteInfo } from '#shared/types/api'
import { peekToken } from '../../domain/tokens'

/** Who an invitation is for, shown before choosing the password. */
export default defineEventHandler(async (event): Promise<InviteInfo> => {
  const { token } = parseQuery(event, z.object({ token: zToken }))
  rateLimit(`invite:${clientIp(event)}`, 60, 60 * 60_000)
  const db = useDb()
  const notFound = () =>
    createError({
      statusCode: 404,
      message: 'L’invito non è valido o è scaduto: chiedi all’amministrazione del camp di inviarne uno nuovo',
    })
  const userId = await peekToken(db, token, 'invite')
  if (!userId) throw notFound()
  const [user] = await db
    .select({
      email: tables.users.email,
      firstName: tables.users.firstName,
      role: tables.users.role,
      status: tables.users.status,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1)
  if (!user || user.status === 'disabled') throw notFound()
  return { email: user.email, firstName: user.firstName, role: user.role }
})
