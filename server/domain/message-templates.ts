// Saved messages the composer starts from (docs/spec.md, 3.7): "Convocazione staff", "Convocazione
// famiglie". The first examples come from migration 0006; the administration adds, edits and deletes.
import { asc, eq } from 'drizzle-orm'
import type { MessageTemplateInput } from '../../shared/schemas/communications'
import type { MessageTemplate } from '../../shared/types/communications'
import { messageTemplates } from '../db/schema'
import type { DbOrTx } from './db'
import { httpError } from './users'

const columns = {
  id: messageTemplates.id,
  name: messageTemplates.name,
  subject: messageTemplates.subject,
  body: messageTemplates.body,
}

const notFound = () => httpError(404, 'Modello non trovato')

export async function listMessageTemplates(db: DbOrTx): Promise<MessageTemplate[]> {
  return db.select(columns).from(messageTemplates).orderBy(asc(messageTemplates.name))
}

export async function createMessageTemplate(db: DbOrTx, input: MessageTemplateInput): Promise<string> {
  const [row] = await db.insert(messageTemplates).values(input).returning({ id: messageTemplates.id })
  return row!.id
}

export async function updateMessageTemplate(db: DbOrTx, id: string, input: MessageTemplateInput): Promise<void> {
  const [row] = await db
    .update(messageTemplates)
    .set(input)
    .where(eq(messageTemplates.id, id))
    .returning({ id: messageTemplates.id })
  if (!row) throw notFound()
}

export async function deleteMessageTemplate(db: DbOrTx, id: string): Promise<void> {
  const [row] = await db
    .delete(messageTemplates)
    .where(eq(messageTemplates.id, id))
    .returning({ id: messageTemplates.id })
  if (!row) throw notFound()
}
