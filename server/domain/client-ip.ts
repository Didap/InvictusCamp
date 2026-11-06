// The address of the client, for rate limits, the audit log and the signature certificate.

/**
 * The client address of a request that reached the app through the one proxy it trusts (Traefik on
 * Coolify). The proxy appends the address it saw to X-Forwarded-For, so the rightmost entry is the only
 * one the client cannot write: whatever comes before it was sent by the client and may be forged.
 * Without the header (a direct connection, local development) the address of the socket.
 * Trust assumption: the app is reachable only through that proxy. Exposed directly, a client could
 * send its own X-Forwarded-For; behind a second proxy, the rightmost entry would be that proxy.
 */
export function forwardedClientIp(
  forwardedFor: string | null | undefined,
  socketAddress: string | null | undefined,
): string | null {
  return forwardedFor?.split(',').at(-1)?.trim() || socketAddress || null
}
