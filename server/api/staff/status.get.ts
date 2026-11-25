/** Where the application of the signed-in person stands: it decides which pages of the area they see. */
export default defineEventHandler(async event => {
  const { profile } = await requireStaff(event)
  return { status: profile.status }
})
