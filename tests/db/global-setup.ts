// Drops, creates and migrates the test database once per run. It must be named *_test, so a wrong
// TEST_DATABASE_URL can never drop the development database.
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { TEST_URL } from './url'

export default async function setup() {
  const target = new URL(TEST_URL)
  const name = target.pathname.slice(1)
  if (!/^[a-z0-9_]+_test$/.test(name)) throw new Error(`TEST_DATABASE_URL must name a *_test database (got "${name}")`)
  const maintenance = new URL(TEST_URL)
  maintenance.pathname = '/postgres'
  const admin = postgres(maintenance.toString(), { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.unsafe(`create database "${name}"`)
  } finally {
    await admin.end()
  }
  const client = postgres(TEST_URL, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), {
      migrationsFolder: new URL('../../server/db/migrations', import.meta.url).pathname,
    })
  } finally {
    await client.end()
  }
}
