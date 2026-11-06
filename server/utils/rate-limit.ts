const buckets = new Map<string, { count: number; resetAt: number }>()

/**
 * A small in-memory fixed-window limiter (one process). Throws 429 when `key` has been hit more than
 * `max` times in `windowMs`. Used on sign-in, registration, password reset and signature codes.
 */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
    }
    return
  }
  bucket.count++
  if (bucket.count > max) {
    throw createError({ statusCode: 429, message: 'Troppi tentativi: riprova tra qualche minuto' })
  }
}
