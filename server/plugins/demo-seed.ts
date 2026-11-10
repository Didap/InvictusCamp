// A test installation to try every role: with NUXT_DEMO_SEED=true the server adds the demo data at start
// (accounts in DEMO_ACCOUNTS, password DEMO_PASSWORD), once and only while there are no families
// (seedDemoIfMissing). Remove the variable afterwards.
import { DEMO_PASSWORD, seedDemoIfMissing } from '../domain/seed'

export default defineNitroPlugin(() => {
  if (!useRuntimeConfig().demoSeed) return
  useDb()
    .transaction(tx =>
      seedDemoIfMissing(tx, { passwordHash: () => hashPassword(DEMO_PASSWORD), uploadsDir: uploadsDir() }),
    )
    .then(outcome =>
      console.log(
        typeof outcome === 'string'
          ? `demo-seed: ${outcome}, nothing added; remove NUXT_DEMO_SEED`
          : `demo-seed: ${outcome.users} users, ${outcome.families} families, ${outcome.sessions} sessions`,
      ),
    )
    .catch(error => console.error('demo-seed: failed', error))
})
