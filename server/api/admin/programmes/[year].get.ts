import { getYearProgramme } from '#server/domain/programmes'
import { programmeYearParamsSchema } from '#shared/schemas/programmes'
import type { ProgrammeDto } from '#shared/types/programmes'

export default defineEventHandler(async (event): Promise<ProgrammeDto> => {
  await requireAdmin(event)
  return getYearProgramme(useDb(), parseParams(event, programmeYearParamsSchema).year)
})
