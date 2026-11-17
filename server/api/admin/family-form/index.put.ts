import { saveFamilyForm } from '#server/domain/questionnaires'
import { familyFormSaveSchema } from '#shared/schemas/questionnaires'
import type { FamilyFormSaveResult } from '#shared/types/families'

/** Saves the questionnaire; 409 when someone saved after it was loaded. */
export default defineEventHandler(async (event): Promise<FamilyFormSaveResult> => {
  const admin = await requireAdmin(event)
  const values = await parseBody(event, familyFormSaveSchema)
  return useDb().transaction(tx => saveFamilyForm(tx, { values, actor: { userId: admin.id, ip: clientIp(event) } }))
})
