// The Drizzle client and its types, without Nuxt auto-imports: domain modules, scripts and the
// database tests import this file directly. The server uses it through useDb() (server/utils/db.ts).
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

export type Db = PostgresJsDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** A transaction handle or the client itself: domain functions accept both. */
export type DbOrTx = Db | Tx

/** A Drizzle client with the schema and snake_case columns, plus its connection (to close it in tests). */
export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  })
  const db: Db = drizzle(client, { schema, casing: 'snake_case' })
  return { db, client }
}

export { schema }
