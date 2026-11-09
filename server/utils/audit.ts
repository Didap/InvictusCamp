import type { H3Event } from 'h3'
import { writeAudit, type AuditEntry } from '../domain/audit'
import type { DbOrTx } from '../domain/db'

/** Records a sensitive action, with the client address when there is a request. */
export async function audit(event: H3Event | null, entry: AuditEntry, db: DbOrTx = useDb()): Promise<void> {
  await writeAudit(db, { ...entry, ip: entry.ip ?? (event ? clientIp(event) : null) })
}
