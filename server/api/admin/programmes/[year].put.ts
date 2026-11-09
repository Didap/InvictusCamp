import { saveYearProgramme } from '#server/domain/programmes'
import { programmeSaveSchema } from '#shared/schemas/programmes'
import type { ProgrammeDto } from '#shared/types/programmes'

/** Saves the programme of a year; 409 when someone saved after it was loaded. */
export default defineEventHandler(async (event): Promise<ProgrammeDto> => {
  const admin = await requireAdmin(event)
  const year = requireYearParam(event)
  const values = await parseBody(event, programmeSaveSchema)
  return useDb().transaction(tx =>
    saveYearProgramme(tx, { year, values, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
})
