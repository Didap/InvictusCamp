import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/** A random token for email links (256 bits, URL safe). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/** A six-digit one-time code (signature confirmation). */
export function otpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}
