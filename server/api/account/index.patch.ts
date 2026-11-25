import { eq } from 'drizzle-orm'
import { accountSchema } from '#shared/schemas/auth'
import type { AccountDto } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<AccountDto> => {
  const current = await requireUser(event)
  const input = await parseBody(event, accountSchema)
  const actor = { userId: current.id, ip: clientIp(event) }
  const { user, emails } = await useDb().transaction(async tx => {
    const [user] = await tx
      .update(tables.users)
      .set({ firstName: input.firstName, lastName: input.lastName, phone: input.phone || null })
      .where(eq(tables.users.id, current.id))
      .returning()
    return { user: user!, emails: await accountChanged(tx, user!, actor) }
  })
  await deliver(emails)
  const session = await getUserSession(event)
  await replaceUserSession(event, {
    user: toSessionUser(user),
    loggedInAt: session.loggedInAt ?? new Date().toISOString(),
  })
  return toAccountDto(user)
})
