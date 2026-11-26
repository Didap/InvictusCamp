import { emailActiveSchema } from '#shared/schemas/automatic-emails'
import { setEmailActive } from '../../../../domain/automatic-emails'

/** Switches an automatic email on or off: off, its event no longer sends it. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const key = requireAutomaticEmailKey(event)
  const { active } = await parseBody(event, emailActiveSchema)
  await setEmailActive(useDb(), { key, active, actorId: admin.id })
  return { key, active }
})
