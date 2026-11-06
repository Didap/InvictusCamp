import { familyFormSchema } from '#shared/schemas/families'
import type { FamilyProfileDto } from '#shared/types/families'
import { saveFamilyForm, toFamilyProfile } from '../../../domain/families'

/** Saves the questionnaire as a draft, or sends it (`submit`); a sent questionnaire stays editable. */
export default defineEventHandler(async (event): Promise<FamilyProfileDto> => {
  const { user, family } = await requireFamily(event)
  const input = await parseBody(event, familyFormSchema)
  const row = await useDb().transaction(tx =>
    saveFamilyForm(tx, {
      familyId: family.id,
      answers: input.answers,
      submit: input.submit,
      actor: { userId: user.id, ip: clientIp(event) },
    }),
  )
  return toFamilyProfile(row)
})
