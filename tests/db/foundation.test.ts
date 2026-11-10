import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { requestSignatures } from '../../server/domain/signature-requests'
import { consumeToken, issueToken, peekToken } from '../../server/domain/tokens'
import { ensureFirstAdmin } from '../../server/domain/users'
import { makeAdmin, makeDocument, makeUser, t, useTestDb } from './helpers'

const db = useTestDb()

describe('one-time tokens', () => {
  it('work once', async () => {
    const user = await makeUser(db)
    const token = await issueToken(db, user.id, 'reset_password')
    expect(await peekToken(db, token, 'reset_password')).toBe(user.id)
    expect(await consumeToken(db, token, 'invite')).toBeNull()
    expect(await consumeToken(db, token, 'reset_password')).toBe(user.id)
    expect(await consumeToken(db, token, 'reset_password')).toBeNull()
  })

  it('expire, and a new one retires the old', async () => {
    const user = await makeUser(db)
    const old = await issueToken(db, user.id, 'invite', new Date('2026-01-01T00:00:00Z'))
    expect(await peekToken(db, old, 'invite', new Date('2026-01-09T00:00:00Z'))).toBeNull()
    const first = await issueToken(db, user.id, 'verify_email')
    const second = await issueToken(db, user.id, 'verify_email')
    expect(await consumeToken(db, first, 'verify_email')).toBeNull()
    expect(await consumeToken(db, second, 'verify_email')).toBe(user.id)
  })

  it('are stored only as a hash', async () => {
    const user = await makeUser(db)
    const token = await issueToken(db, user.id, 'invite')
    const [row] = await db.select().from(t.authTokens).where(eq(t.authTokens.userId, user.id))
    expect(row!.tokenHash).not.toBe(token)
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('signature requests', () => {
  it('are created once and reopened when cancelled', async () => {
    const document = await makeDocument(db)
    const anna = await makeUser(db)
    const luca = await makeUser(db)
    const created = await requestSignatures(db, { documentId: document.id, userIds: [anna.id, luca.id, anna.id] })
    expect(created).toHaveLength(2)
    expect(await requestSignatures(db, { documentId: document.id, userIds: [anna.id] })).toHaveLength(0)

    await db.update(t.signatureRequests).set({ status: 'cancelled' }).where(eq(t.signatureRequests.userId, anna.id))
    const reopened = await requestSignatures(db, { documentId: document.id, userIds: [anna.id, luca.id] })
    expect(reopened.map(r => r.userId)).toEqual([anna.id])
  })
})

describe('first admin', () => {
  const input = { email: ' Segreteria@Invictus.local ', passwordHash: 'hash' }

  it('creates an active admin only while there is none', async () => {
    expect(await ensureFirstAdmin(db, input)).toBe('created')
    const [admin] = await db.select().from(t.users).where(eq(t.users.role, 'admin'))
    expect(admin).toMatchObject({ email: 'segreteria@invictus.local', status: 'active', passwordHash: 'hash' })
    expect(admin!.emailVerifiedAt).not.toBeNull()
    expect(await ensureFirstAdmin(db, { ...input, email: 'altra@invictus.local' })).toBe('admin-exists')
    expect(await db.$count(t.users)).toBe(1)
  })

  it('leaves an existing installation and a taken address alone', async () => {
    await makeAdmin(db)
    expect(await ensureFirstAdmin(db, input)).toBe('admin-exists')
    await db.delete(t.users)
    await makeUser(db, { email: 'segreteria@invictus.local' })
    expect(await ensureFirstAdmin(db, input)).toBe('email-taken')
    expect(await db.$count(t.users, eq(t.users.role, 'admin'))).toBe(0)
  })
})
