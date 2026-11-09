import { createYearProgramme, getYearProgramme } from '#server/domain/programmes'
import { programmeCreateSchema } from '#shared/schemas/programmes'
import type { ProgrammeDto } from '#shared/types/programmes'

/** Creates the programme of a year: from the model week, empty, or as a copy of another year. */
export default defineEventHandler(async (event): Promise<ProgrammeDto> => {
  const admin = await requireAdmin(event)
  const values = await parseBody(event, programmeCreateSchema)
  await useDb().transaction(tx => createYearProgramme(tx, { values, actor: { userId: admin.id, ip: clientIp(event) } }))
  return getYearProgramme(useDb(), values.year)
})
