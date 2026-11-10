import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { DEMO_ACCOUNTS, seedDemoIfMissing } from '../../server/domain/seed'
import { requestSignatures } from '../../server/domain/signature-requests'
import { consumeToken, issueToken, peekToken } from '../../server/domain/tokens'
import { ensureFirstAdmin } from '../../server/domain/users'
import { makeAdmin, makeDocument, makeFamily, makeUser, t, useTestDb } from './helpers'

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
  const input = { email: 'segreteria@invictus.local', passwordHash: async () => 'hash' }

  it('creates an active admin only while there is none, hashing only then', async () => {
    expect(await ensureFirstAdmin(db, input)).toBe('created')
    const [admin] = await db.select().from(t.users).where(eq(t.users.role, 'admin'))
    expect(admin).toMatchObject({ email: 'segreteria@invictus.local', status: 'active', passwordHash: 'hash' })
    expect(admin!.emailVerifiedAt).not.toBeNull()
    const hash = vi.fn(async () => 'altro')
    expect(await ensureFirstAdmin(db, { email: 'altra@invictus.local', passwordHash: hash })).toBe('admin-exists')
    expect(hash).not.toHaveBeenCalled()
    expect(await db.$count(t.users)).toBe(1)
  })

  it('ignores a disabled admin and never takes over an address in use', async () => {
    await makeUser(db, { role: 'admin', status: 'disabled' })
    await makeUser(db, { email: 'segreteria@invictus.local' })
    expect(await ensureFirstAdmin(db, input)).toBe('email-taken')
    expect(await ensureFirstAdmin(db, { ...input, email: 'nuova@invictus.local' })).toBe('created')
    expect(await db.$count(t.users, eq(t.users.role, 'admin'))).toBe(2)
  })
})

describe('demo seed', () => {
  const seed = (uploadsDir: string) =>
    db.transaction(tx => seedDemoIfMissing(tx, { passwordHash: async () => 'hash', uploadsDir }))

  it('fills an installation with its own admin and programme once, with a family still to fill in', async () => {
    const uploadsDir = await mkdtemp(join(tmpdir(), 'invictus-seed-'))
    try {
      await makeAdmin(db)
      await db.insert(t.programmes).values({ year: 2027, content: { days: [] } })
      const summary = await seed(uploadsDir)
      expect(summary).toMatchObject({ families: expect.any(Number) })
      const [user] = await db.select().from(t.users).where(eq(t.users.email, DEMO_ACCOUNTS.newFamily))
      const [family] = await db.select().from(t.families).where(eq(t.families.userId, user!.id))
      expect(family).toMatchObject({ formStatus: 'draft', formAnswers: {} })
      expect(await seed(uploadsDir)).toBeNull()
    } finally {
      await rm(uploadsDir, { recursive: true, force: true })
    }
  })

  it('never seeds beside families', async () => {
    await makeFamily(db)
    expect(await seed('/nonexistent')).toBeNull()
    expect(await db.$count(t.users, eq(t.users.email, DEMO_ACCOUNTS.admin))).toBe(0)
  })
})
