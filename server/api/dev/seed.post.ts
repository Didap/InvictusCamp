import { DEMO_PASSWORD, seedDemoIfMissing, truncateAll } from '../../domain/seed'

/** Development only: fills the database with demo data (?fresh empties it first). */
export default defineEventHandler(async event => {
  if (!import.meta.dev) throw createError({ statusCode: 404, message: 'Non trovato' })
  const db = useDb()
  if (getQuery(event).fresh !== undefined) await truncateAll(db)
  const summary = await db.transaction(tx =>
    seedDemoIfMissing(tx, { passwordHash: () => hashPassword(DEMO_PASSWORD), uploadsDir: uploadsDir() }),
  )
  if (!summary) return { seeded: false, message: 'Il database contiene già famiglie: usa --fresh per ricrearle' }
  return { seeded: true, ...summary }
})
