import * as tables from '../db/schema'
import { createDb, type Db } from '../domain/db'

export { tables }
export { isUniqueViolation } from '../domain/db'

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
