import { adminNotesSchema } from '#shared/schemas/families'
import { updateAdminNotes } from '../../../../domain/families'

/** Internal notes of the administration on a family; never shown to the family. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const familyId = requireUuidParam(event, 'id')
  const { adminNotes } = await parseBody(event, adminNotesSchema)
  return { adminNotes: await updateAdminNotes(useDb(), familyId, adminNotes) }
})
