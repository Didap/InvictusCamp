import { saveReleaseText } from '#server/domain/releases'
import { releaseTextSaveSchema } from '#shared/schemas/releases'
import type { ReleaseTextDto } from '#shared/types/families'

/** Saves the text of the family release; 409 when someone saved after it was loaded. */
export default defineEventHandler(async (event): Promise<ReleaseTextDto> => {
  const admin = await requireAdmin(event)
  const values = await parseBody(event, releaseTextSaveSchema)
  return useDb().transaction(tx => saveReleaseText(tx, { values, actor: { userId: admin.id, ip: clientIp(event) } }))
})
