// Database tests call domain functions (server/domain/*) directly against the test database. Every
// test starts from empty tables. Factories create the smallest valid rows; pass values to override.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach } from 'vitest'
import * as t from '../../server/db/schema'
import { createDb, type Db } from '../../server/domain/db'
import { truncateAll } from '../../server/domain/seed'
import type { StaffStatus } from '../../shared/utils/constants'
import { TEST_URL } from './url'

export { t }

/** The test database, emptied before every test of the file. */
export function useTestDb(): Db {
  const { db, client } = createDb(TEST_URL, { max: 2 })
  beforeEach(async () => {
    await truncateAll(db)
  })
  afterAll(async () => {
    await client.end()
  })
  return db
}

export async function makeUser(db: Db, values: Partial<typeof t.users.$inferInsert> = {}) {
  const [user] = await db
    .insert(t.users)
    .values({
      email: `${randomUUID()}@test.local`,
      role: 'family',
      status: 'active',
      firstName: 'Prova',
      lastName: 'Utente',
      emailVerifiedAt: new Date(),
      ...values,
    })
    .returning()
  return user!
}

export async function makeAdmin(db: Db) {
  return makeUser(db, { role: 'admin', firstName: 'Giulia', lastName: 'Conte' })
}

export async function makeFamily(db: Db, values: Partial<typeof t.families.$inferInsert> = {}) {
  const user = await makeUser(db, { role: 'family' })
  const [family] = await db
    .insert(t.families)
    .values({ userId: user.id, name: 'Famiglia di prova', ...values })
    .returning()
  return { user, family: family! }
}

export async function makeStaff(db: Db, status: StaffStatus = 'approved') {
  const user = await makeUser(db, { role: 'staff' })
  const [profile] = await db.insert(t.staffProfiles).values({ userId: user.id, status }).returning()
  return { user, profile: profile! }
}

export async function makeSession(db: Db, values: Partial<typeof t.campSessions.$inferInsert> = {}) {
  const [session] = await db
    .insert(t.campSessions)
    .values({
      title: 'Sessione di prova',
      location: 'Invictus Camp',
      startDate: '2027-06-21',
      endDate: '2027-06-27',
      familySlots: 3,
      staffNeeded: 2,
      ...values,
    })
    .returning()
  return session!
}

/** A document row with a fake file record (no bytes on disk). */
export async function makeDocument(db: Db, values: Partial<typeof t.documents.$inferInsert> = {}) {
  const [file] = await db
    .insert(t.files)
    .values({
      storageKey: `test/${randomUUID()}.pdf`,
      originalName: 'documento.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: '0'.repeat(64),
      purpose: 'document',
    })
    .returning()
  const [document] = await db
    .insert(t.documents)
    .values({ title: 'Documento di prova', category: 'contract', fileId: file!.id, ...values })
    .returning()
  return document!
}
