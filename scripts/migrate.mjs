// Applies pending Drizzle migrations to DATABASE_URL. Prints one or two lines and exits 0 or 1.
//
// On a shared Postgres server (shared-postgres of the Coolify project shared-infra), DATABASE_ADMIN_URL
// (a superuser of the same server) lets the first run create the role and the database named in
// DATABASE_URL when they are missing. Remove it once they exist: the app never needs it.
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

/** Creates the role and the database of `url` on the server of `adminUrl` when they are missing. */
async function ensureDatabase(adminUrl, url) {
  const target = new URL(url)
  const role = decodeURIComponent(target.username)
  const password = decodeURIComponent(target.password)
  const database = target.pathname.slice(1)
  const identifier = /^[a-z_][a-z0-9_]*$/
  if (!identifier.test(role) || !identifier.test(database) || !password) {
    throw new Error('DATABASE_URL needs a plain role name, a password and a database name')
  }
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
  try {
    const created = []
    const [hasRole] = await admin`select 1 from pg_roles where rolname = ${role}`
    if (!hasRole) {
      await admin.unsafe(`create role "${role}" login password '${password.replaceAll("'", "''")}'`)
      created.push(`role ${role}`)
    }
    const [hasDatabase] = await admin`select 1 from pg_database where datname = ${database}`
    if (!hasDatabase) {
      await admin.unsafe(`create database "${database}" owner "${role}"`)
      await admin.unsafe(`revoke all on database "${database}" from public`)
      created.push(`database ${database}`)
    }
    return created.length ? `created ${created.join(' and ')}` : 'role and database already exist'
  } finally {
    await admin.end()
  }
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('migrate: DATABASE_URL is not set')
  process.exit(1)
}
if (process.env.DATABASE_ADMIN_URL) {
  try {
    console.log(`migrate: ${await ensureDatabase(process.env.DATABASE_ADMIN_URL, url)}`)
  } catch (error) {
    console.error('migrate: bootstrap failed:', error.message)
    process.exit(1)
  }
}
const client = postgres(url, { max: 1, onnotice: () => {} })
try {
  await migrate(drizzle(client), { migrationsFolder: new URL('../server/db/migrations', import.meta.url).pathname })
  console.log('migrate: ok')
} catch (error) {
  console.error('migrate: failed:', error.message)
  process.exitCode = 1
} finally {
  await client.end()
}
