import { eq } from 'drizzle-orm'
import { accountSchema } from '#shared/schemas/auth'
import type { AccountDto } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<AccountDto> => {
  const current = await requireUser(event)
  const input = await parseBody(event, accountSchema)
  const { user, emails } = await useDb().transaction(async tx => {
    const [user] = await tx
      .update(tables.users)
      .set({ firstName: input.firstName, lastName: input.lastName, phone: input.phone || null })
      .where(eq(tables.users.id, current.id))
      .returning()
    const emails = await accountChanged(tx, user!, { userId: user!.id, ip: clientIp(event) })
    return { user: user!, emails }
  })
  await deliver(emails)
  const session = await getUserSession(event)
  await replaceUserSession(event, {
    user: toSessionUser(user),
    loggedInAt: session.loggedInAt ?? new Date().toISOString(),
  })
  return toAccountDto(user)
})
