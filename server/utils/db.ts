import * as tables from '../db/schema'
import { createDb, type Db } from '../domain/db'

export { tables }

/** A unique constraint was violated (e.g. the same email twice): Postgres code 23505. */
export function isUniqueViolation(error: unknown): boolean {
  const code = error as { code?: string; cause?: { code?: string } } | null
  return code?.code === '23505' || code?.cause?.code === '23505'
}

let instance: Db | null = null

/** The shared Drizzle client of the server. */
export function useDb(): Db {
  if (!instance) {
    const url = useRuntimeConfig().databaseUrl || process.env.DATABASE_URL
    if (!url) throw createError({ statusCode: 500, message: 'DATABASE_URL non configurato' })
    instance = createDb(url).db
  }
  return instance
}
