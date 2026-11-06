import { sql } from 'drizzle-orm'
import { DEMO_PASSWORD, seedDemo, truncateAll } from '../../domain/seed'

/** Development only: fills the database with demo data (?fresh empties it first). */
export default defineEventHandler(async event => {
  if (!import.meta.dev) throw createError({ statusCode: 404, message: 'Non trovato' })
  const fresh = getQuery(event).fresh !== undefined
  const db = useDb()
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(tables.users)
  if ((row?.count ?? 0) > 0 && !fresh) {
    return { seeded: false, message: 'Il database contiene già dati: usa --fresh per ricrearli' }
  }
  if (fresh) await truncateAll(db)
  const summary = await seedDemo(db, { passwordHash: await hashPassword(DEMO_PASSWORD), uploadsDir: uploadsDir() })
  return { seeded: true, ...summary }
})
