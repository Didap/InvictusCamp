import { healthConsentSchema } from '#shared/schemas/families'
import type { HealthConsentResult } from '#shared/types/families'
import { setHealthConsent } from '../../../domain/families'
import { removeStoredBytes } from '../../../domain/storage'

/**
 * Gives or withdraws the consent to health data; withdrawing deletes the details already entered and
 * the certificates and diagnoses uploaded (their bytes once the transaction is committed).
 */
export default defineEventHandler(async (event): Promise<HealthConsentResult> => {
  const { user, family } = await requireFamily(event)
  const { given } = await parseBody(event, healthConsentSchema)
  const { storageKeys, ...result } = await useDb().transaction(tx =>
    setHealthConsent(tx, { familyId: family.id, given, actor: { userId: user.id, ip: clientIp(event) } }),
  )
  await removeStoredBytes(uploadsDir(), storageKeys).catch(() => {})
  return result
})
