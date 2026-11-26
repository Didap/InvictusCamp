// Runs the email queue every 30 seconds, often enough never to miss the 23:59 round. The claim is
// transactional, so two instances during a deploy cannot send the same email twice.
const TICK_MS = 30_000

export default defineNitroPlugin(nitroApp => {
  if (import.meta.prerender) return
  let running = false
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      const sent = await drainEmailQueue()
      if (sent) console.log(`[email] coda: ${sent} email partite`)
    } catch (error) {
      logEmailError('coda non elaborata', error)
    } finally {
      running = false
    }
  }, TICK_MS)
  timer.unref()
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
