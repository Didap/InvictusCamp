import { getFamilyForm } from '#server/domain/questionnaires'
import type { FamilyFormDto } from '#shared/types/families'

/** The questionnaire «Dati della famiglia» as it is now, for the editor and the record of a family. */
export default defineEventHandler(async (event): Promise<FamilyFormDto> => {
  await requireAdmin(event)
  return getFamilyForm(useDb())
})
