// Saved messages the composer starts from (docs/spec.md, 3.7): "Convocazione staff", "Convocazione
// famiglie". The first examples come from migration 0006; the administration adds, edits and deletes.
import { asc, eq } from 'drizzle-orm'
import type { EmailTemplateInput } from '../../shared/schemas/communications'
import type { EmailTemplate } from '../../shared/types/communications'
import { emailTemplates } from '../db/schema'
import type { DbOrTx } from './db'
import { httpError } from './users'

const columns = {
  id: emailTemplates.id,
  name: emailTemplates.name,
  subject: emailTemplates.subject,
  body: emailTemplates.body,
  updatedAt: emailTemplates.updatedAt,
}

const notFound = () => httpError(404, 'Modello non trovato')

export async function listEmailTemplates(db: DbOrTx): Promise<EmailTemplate[]> {
  const rows = await db.select(columns).from(emailTemplates).orderBy(asc(emailTemplates.name))
  return rows.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString() }))
}

export async function createEmailTemplate(db: DbOrTx, input: EmailTemplateInput): Promise<string> {
  const [row] = await db.insert(emailTemplates).values(input).returning({ id: emailTemplates.id })
  return row!.id
}

export async function updateEmailTemplate(db: DbOrTx, id: string, input: EmailTemplateInput): Promise<void> {
  const [row] = await db
    .update(emailTemplates)
    .set(input)
    .where(eq(emailTemplates.id, id))
    .returning({ id: emailTemplates.id })
  if (!row) throw notFound()
}

export async function deleteEmailTemplate(db: DbOrTx, id: string): Promise<void> {
  const [row] = await db.delete(emailTemplates).where(eq(emailTemplates.id, id)).returning({ id: emailTemplates.id })
  if (!row) throw notFound()
}
