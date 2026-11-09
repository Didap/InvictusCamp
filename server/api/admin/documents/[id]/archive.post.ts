import { documentArchiveSchema } from '#shared/schemas/documents'
import { setDocumentArchived } from '~~/server/domain/signatures'

/** Archives a document (its pending requests are cancelled, no email) or restores it. */
export default defineEventHandler(async (event): Promise<{ cancelled: number }> => {
  const admin = await requireAdmin(event)
  const documentId = requireUuidParam(event, 'id')
  const { archived } = await parseBody(event, documentArchiveSchema)
  return useDb().transaction(tx =>
    setDocumentArchived(tx, { documentId, archived, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
})
