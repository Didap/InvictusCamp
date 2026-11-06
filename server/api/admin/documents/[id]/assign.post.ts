import { assignSchema } from '#shared/schemas/documents'
import type { AssignResult } from '#shared/types/documents'
import { assignDocument } from '~~/server/domain/signatures'

/**
 * Assigns the document to chosen people, all families, all approved staff, or the families or staff
 * of a session; one email per new request. With `dryRun` it only counts (the confirmation's numbers).
 */
export default defineEventHandler(async (event): Promise<AssignResult> => {
  const admin = await requireAdmin(event)
  const documentId = requireUuidParam(event, 'id')
  const input = await parseBody(event, assignSchema)
  const { result, messages } = await useDb().transaction(tx =>
    assignDocument(tx, emailContext(), {
      documentId,
      target: input.target,
      dueDate: input.dueDate ?? null,
      dryRun: input.dryRun,
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  await deliver(messages)
  return result
})
