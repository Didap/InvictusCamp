import { eq } from 'drizzle-orm'
import { accountSchema } from '#shared/schemas/auth'
import type { AccountDto } from '#shared/types/api'
import { staffSheetDocument } from '../../domain/staff-sheets'

export default defineEventHandler(async (event): Promise<AccountDto> => {
  const current = await requireUser(event)
  const input = await parseBody(event, accountSchema)
  const { user, emails } = await useDb().transaction(async tx => {
    const [user] = await tx
      .update(tables.users)
      .set({ firstName: input.firstName, lastName: input.lastName, phone: input.phone || null })
      .where(eq(tables.users.id, current.id))
      .returning()
    // Name and phone are in the PDF of a staff member's sheet: a change makes it again, to sign.
    const emails =
      user!.role === 'staff'
        ? await staffSheetDocument(tx, {
            userId: user!.id,
            ctx: emailContext(),
            uploadsDir: uploadsDir(),
            actor: { userId: user!.id, ip: clientIp(event) },
          })
        : []
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
