// A new installation has no account that can invite the others: at start, when NUXT_FIRST_ADMIN_EMAIL and
// NUXT_FIRST_ADMIN_PASSWORD are set and no admin exists yet, this creates one. Remove both variables
// after the first sign-in (the password lives on in the environment otherwise).
import { zPassword } from '#shared/schemas/common'
import { ensureFirstAdmin } from '../domain/users'

export default defineNitroPlugin(() => {
  const { email, password } = useRuntimeConfig().firstAdmin
  if (!email || !password) return
  if (!zPassword.safeParse(password).success) {
    console.error('first-admin: NUXT_FIRST_ADMIN_PASSWORD needs at least 10 characters, no account created')
    return
  }
  hashPassword(password)
    .then(passwordHash => ensureFirstAdmin(useDb(), { email, passwordHash }))
    .then(outcome => console.log(`first-admin: ${outcome}`))
    .catch(error => console.error('first-admin: failed', error))
})
