import { getYearProgramme } from '#server/domain/programmes'
import type { ProgrammeDto } from '#shared/types/programmes'

export default defineEventHandler(async (event): Promise<ProgrammeDto> => {
  await requireAdmin(event)
  return getYearProgramme(useDb(), requireYearParam(event))
})
