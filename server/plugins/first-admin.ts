// A new installation has no account that can invite the others: at start, when NUXT_FIRST_ADMIN_EMAIL and
// NUXT_FIRST_ADMIN_PASSWORD are set and no active admin exists yet, this creates one. Remove both
// variables after the first sign-in (the password lives on in the environment otherwise).
import { z } from 'zod'
import { zEmail, zPassword } from '#shared/schemas/common'
import { ensureFirstAdmin } from '../domain/users'

const firstAdminSchema = z.object({ email: zEmail, password: zPassword })

export default defineNitroPlugin(() => {
  const { firstAdmin } = useRuntimeConfig()
  if (!firstAdmin.email && !firstAdmin.password) return
  const parsed = firstAdminSchema.safeParse(firstAdmin)
  if (!parsed.success) {
    const problems = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    console.error(`first-admin: NUXT_FIRST_ADMIN_EMAIL / NUXT_FIRST_ADMIN_PASSWORD not valid (${problems}), no account created`)
    return
  }
  const { email, password } = parsed.data
  useDb()
    .transaction(tx => ensureFirstAdmin(tx, { email, passwordHash: () => hashPassword(password) }))
    .then(outcome => {
      console.log(`first-admin: ${outcome}`)
      if (outcome !== 'email-taken') {
        console.warn('first-admin: remove NUXT_FIRST_ADMIN_EMAIL and NUXT_FIRST_ADMIN_PASSWORD from the environment')
      }
    })
    .catch(error => console.error('first-admin: failed', error))
})
