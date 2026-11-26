import { emailActiveSchema } from '#shared/schemas/automatic-emails'
import type { AutomaticEmailSwitch } from '#shared/types/automatic-emails'
import { automaticEmailDetail, setEmailActive } from '../../../../domain/automatic-emails'

/** Switches an automatic email on or off: off, its event no longer sends it, nor does the queue. */
export default defineEventHandler(async (event): Promise<AutomaticEmailSwitch> => {
  const admin = await requireAdmin(event)
  const key = requireAutomaticEmailKey(event)
  const { active } = await parseBody(event, emailActiveSchema)
  return useDb().transaction(async tx => {
    const held = await setEmailActive(tx, { key, active, actorId: admin.id })
    return { ...(await automaticEmailDetail(tx, key)), held }
  })
})
