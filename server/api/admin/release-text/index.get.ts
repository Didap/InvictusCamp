import { releaseTextDto } from '#server/domain/releases'
import type { ReleaseTextDto } from '#shared/types/families'

/** The text of the family release, with how many releases in force were written with another text. */
export default defineEventHandler(async (event): Promise<ReleaseTextDto> => {
  await requireAdmin(event)
  return releaseTextDto(useDb())
})
