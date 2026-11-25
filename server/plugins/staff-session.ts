import { eq } from 'drizzle-orm'

// The session the client reads (GET /api/_auth/session) carries, for staff, where the application
// stands: the menu and the route middleware keep a person not approved yet on their home (spec 3.4). Read
// at every fetch, never sealed in the cookie, so an approval shows at the next one.
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async session => {
    if (session.user?.role !== 'staff') return
    const [profile] = await useDb()
      .select({ status: tables.staffProfiles.status })
      .from(tables.staffProfiles)
      .where(eq(tables.staffProfiles.userId, session.user.id))
      .limit(1)
    session.staffStatus = profile?.status
  })
})
