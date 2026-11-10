// A test installation to try every role: with NUXT_DEMO_SEED=true the server adds the demo data at start
// (accounts in DEMO_ACCOUNTS, password DEMO_PASSWORD) beside what is already there, once: nothing happens
// while the demo admin exists. Remove the variable afterwards. Never on an installation with real families.
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemo } from '../domain/seed'

export default defineNitroPlugin(() => {
  if (!useRuntimeConfig().demoSeed) return
  const db = useDb()
  db.select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_ACCOUNTS.admin))
    .limit(1)
    .then(async ([demoAdmin]) => {
      if (demoAdmin) return console.log('demo-seed: already there, remove NUXT_DEMO_SEED')
      const summary = await seedDemo(db, { passwordHash: await hashPassword(DEMO_PASSWORD), uploadsDir: uploadsDir() })
      console.log(`demo-seed: ${summary.users} users, ${summary.families} families, ${summary.sessions} sessions`)
    })
    .catch(error => console.error('demo-seed: failed', error))
})
