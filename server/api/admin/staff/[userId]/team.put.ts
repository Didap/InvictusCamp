import { staffTeamSchema } from '#shared/schemas/staff'
import { setStaffTeam } from '../../../../domain/staff'

/**
 * Moves a person between staff and v-team (spec 3.4). The contract formula is the staff's: the sheet's PDF is
 * made again without it, or archived until the person chooses one.
 */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'userId')
  const { team } = await parseBody(event, staffTeamSchema)
  const actor = { userId: admin.id, ip: clientIp(event) }
  const emails = await useDb().transaction(async tx => {
    const moved = await setStaffTeam(tx, { userId, team, actor })
    return moved ? staffSheetChanged(tx, userId, actor) : []
  })
  await deliver(emails)
  return { team }
})
