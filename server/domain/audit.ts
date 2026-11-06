import { auditLog } from '../db/schema'
import type { DbOrTx } from './db'

export interface AuditEntry {
  actorUserId?: string | null
  /** e.g. 'session.status', 'staff.review', 'signature.sign', 'member.health_update', 'user.invite'. */
  action: string
  entityType: string
  entityId?: string | null
  /** What changed. Never passwords, tokens, codes or health details. */
  data?: Record<string, unknown>
  ip?: string | null
}

export async function writeAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    data: entry.data ?? null,
    ip: entry.ip ?? null,
  })
}
