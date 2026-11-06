import { contractOptions } from '#server/domain/sessions'
import type { ContractOption } from '#shared/types/sessions'

/** Documents of category "contract", for the contract of a session. */
export default defineEventHandler(async (event): Promise<ContractOption[]> => {
  await requireAdmin(event)
  return contractOptions(useDb())
})
