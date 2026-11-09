import { listYearProgrammes } from '#server/domain/programmes'
import type { ProgrammeYearItem } from '#shared/types/programmes'

/** The years with a programme, and those with sessions still waiting for one. */
export default defineEventHandler(async (event): Promise<ProgrammeYearItem[]> => {
  await requireAdmin(event)
  return listYearProgrammes(useDb())
})
