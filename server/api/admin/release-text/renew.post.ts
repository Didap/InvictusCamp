import { releaseTextDto, renewReleases } from '#server/domain/releases'
import { releaseRenewSchema } from '#shared/schemas/releases'
import type { ReleaseRenewResult } from '#shared/types/families'

/** «Chiedi la firma sul nuovo testo»: the releases written with another text are made again, one email each. */
export default defineEventHandler(async (event): Promise<ReleaseRenewResult> => {
  const admin = await requireAdmin(event)
  const { revision } = await parseBody(event, releaseRenewSchema)
  const { renewed, emails } = await useDb().transaction(tx =>
    renewReleases(tx, {
      revision,
      ctx: emailContext(),
      uploadsDir: uploadsDir(),
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  await deliver(emails)
  return { renewed, release: await releaseTextDto(useDb()) }
})
