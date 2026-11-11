import { staffTeamSchema } from '#shared/schemas/staff'
import { setStaffTeam } from '../../../../domain/staff'

/** Moves a person between staff and v-team (spec 3.4). */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'userId')
  const { team } = await parseBody(event, staffTeamSchema)
  await useDb().transaction(tx => setStaffTeam(tx, { userId, team, actor: { userId: admin.id, ip: clientIp(event) } }))
  return { team }
})
