import { getFamilyForm } from '#server/domain/questionnaires'
import type { FamilyFormView } from '#shared/types/families'

/** The questions of «Dati della famiglia», as the administration set them, with their revision. */
export default defineEventHandler(async (event): Promise<FamilyFormView> => {
  await requireFamily(event)
  const { content, revision } = await getFamilyForm(useDb())
  return { sections: content.sections, revision }
})
