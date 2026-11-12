import type { MessageTemplate } from '#shared/types/communications'
import { listMessageTemplates } from '../../../domain/message-templates'

/** The saved messages, by name. */
export default defineEventHandler(async (event): Promise<MessageTemplate[]> => {
  await requireAdmin(event)
  return listMessageTemplates(useDb())
})
