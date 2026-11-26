import { staffResourceSchema } from '#shared/schemas/documents'
import { setStaffResource } from '~~/server/domain/staff-resources'

/**
 * Puts the document in the «Risorse utili» of staff and v-team (to accept: as «Assegna → tutto lo staff», one email
 * to each approved person not asked yet), or takes it out. With `dryRun` it only counts (the confirmation's numbers).
 */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const documentId = requireUuidParam(event, 'id')
  const input = await parseBody(event, staffResourceSchema)
  const { result, messages } = await useDb().transaction(tx =>
    setStaffResource(tx, {
      documentId,
      mode: input.mode,
      dryRun: input.dryRun,
      ctx: emailContext(),
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  await deliver(messages)
  return { result }
})
