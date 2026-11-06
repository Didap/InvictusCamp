import { healthConsentSchema } from '#shared/schemas/families'
import type { HealthConsentResult } from '#shared/types/families'
import { setHealthConsent } from '../../../domain/families'

/** Gives or withdraws the consent to health data; withdrawing deletes the details already entered. */
export default defineEventHandler(async (event): Promise<HealthConsentResult> => {
  const { user, family } = await requireFamily(event)
  const { given } = await parseBody(event, healthConsentSchema)
  return useDb().transaction(tx =>
    setHealthConsent(tx, { familyId: family.id, given, actor: { userId: user.id, ip: clientIp(event) } }),
  )
})
