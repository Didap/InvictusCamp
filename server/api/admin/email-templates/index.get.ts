import type { EmailTemplate } from '#shared/types/communications'
import { listEmailTemplates } from '../../../domain/email-templates'

/** The saved messages, by name. */
export default defineEventHandler(async (event): Promise<EmailTemplate[]> => {
  await requireAdmin(event)
  return listEmailTemplates(useDb())
})
