import { familyFormSections } from '#server/domain/questionnaires'
import type { FormSection } from '#shared/content/family-form'

/** The questions of «Dati della famiglia», as the administration set them. */
export default defineEventHandler(async (event): Promise<FormSection[]> => {
  await requireFamily(event)
  return familyFormSections(useDb())
})
