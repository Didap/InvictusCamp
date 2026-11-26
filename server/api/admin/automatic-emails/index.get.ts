import type { AutomaticEmailState } from '#shared/types/automatic-emails'
import { listAutomaticEmails } from '../../../domain/automatic-emails'

/** Comunicazioni › Automatiche: each email on or off, its texts changed or not. */
export default defineEventHandler(async (event): Promise<AutomaticEmailState[]> => {
  await requireAdmin(event)
  return listAutomaticEmails(useDb())
})
