import type { AccountDto } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<AccountDto> => {
  const user = await requireUser(event)
  return toAccountDto(user)
})
