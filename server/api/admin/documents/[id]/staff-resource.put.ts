import { staffResourceSchema } from '#shared/schemas/documents'
import { setStaffResource } from '~~/server/domain/staff-resources'

/** The document in the «Risorse utili» of staff and v-team, or not (spec 3.6). */
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
