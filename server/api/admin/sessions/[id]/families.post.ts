import { addFamilies } from '#server/domain/sessions'
import { addFamiliesSchema } from '#shared/schemas/sessions'
import type { AddFamiliesResult } from '#shared/types/sessions'

/**
 * Adds families as titolari or reserves (contract, docs/BUILD.md: the families area calls it from
 * "Aggiungi a una sessione"). Titolari beyond the free places are refused (409). While the session is
 * inviting or confirmed the families are invited at once and the emails leave after the commit.
 */
export default defineEventHandler(async (event): Promise<AddFamiliesResult> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const { familyIds, kind } = await parseBody(event, addFamiliesSchema)
  const result = await useDb().transaction(tx =>
    addFamilies(tx, emailContext(), {
      sessionId,
      familyIds,
      kind,
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  await deliver(result.emails)
  return { added: result.added, invited: result.invited }
})
