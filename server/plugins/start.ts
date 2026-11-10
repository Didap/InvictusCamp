// At start, in this order, so the demo admins never stand in for the real one:
// 1. the first admin of a new installation, from NUXT_FIRST_ADMIN_EMAIL and NUXT_FIRST_ADMIN_PASSWORD
//    (ensureFirstAdmin); remove both after the first sign-in;
// 2. with NUXT_DEMO_SEED=true, the demo data of a test installation (seedDemoIfMissing); remove it after.
import { z } from 'zod'
import { zEmail, zPassword } from '#shared/schemas/common'
import { DEMO_PASSWORD, seedDemoIfMissing } from '../domain/seed'
import { ensureFirstAdmin } from '../domain/users'

const firstAdminSchema = z.object({ email: zEmail, password: zPassword })

async function firstAdmin(input: { email: string; password: string }) {
  if (!input.email && !input.password) return
  const parsed = firstAdminSchema.safeParse(input)
  if (!parsed.success) {
    const problems = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    console.error(
      `first-admin: NUXT_FIRST_ADMIN_EMAIL / NUXT_FIRST_ADMIN_PASSWORD not valid (${problems}), no account created`,
    )
    return
  }
  const { email, password } = parsed.data
  const outcome = await useDb().transaction(tx =>
    ensureFirstAdmin(tx, { email, passwordHash: () => hashPassword(password) }),
  )
  console.log(`first-admin: ${outcome}`)
  if (outcome !== 'email-taken') {
    console.warn('first-admin: remove NUXT_FIRST_ADMIN_EMAIL and NUXT_FIRST_ADMIN_PASSWORD from the environment')
  }
}

async function demoSeed() {
  const summary = await useDb().transaction(tx =>
    seedDemoIfMissing(tx, { passwordHash: () => hashPassword(DEMO_PASSWORD), uploadsDir: uploadsDir() }),
  )
  console.log(
    summary
      ? `demo-seed: ${summary.users} users, ${summary.families} families, ${summary.sessions} sessions`
      : 'demo-seed: families already there, nothing added; remove NUXT_DEMO_SEED',
  )
}

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  firstAdmin(config.firstAdmin)
    .catch(error => console.error('first-admin: failed', error))
    .then(() => (config.demoSeed ? demoSeed() : undefined))
    .catch(error => console.error('demo-seed: failed', error))
})
