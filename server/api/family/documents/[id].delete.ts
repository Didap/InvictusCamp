import { removePersonalDocument } from '../../../domain/families'

/** The family deletes one of its personal documents, file included (404 for anyone else's). */
export default defineEventHandler(async event => {
  const { user } = await requireFamily(event)
  const documentId = requireUuidParam(event, 'id')
  await removePersonalDocument(useDb(), uploadsDir(), { userId: user.id, documentId })
  return { ok: true }
})
