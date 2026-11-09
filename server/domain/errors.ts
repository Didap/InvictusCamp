/**
 * The HTTP error of the domain modules: an Italian message, a status and optional data. It carries
 * H3Error's static marker, so thrown from a handler h3 answers with its status, message and data exactly
 * as for h3's createError(). Domain modules use it instead of h3's createError because `h3` is not a
 * direct dependency (pnpm keeps it inside Nuxt), so the database tests could not load it.
 */
export class DomainError extends Error {
  static __h3_error__ = true
  statusCode: number
  statusMessage?: string
  data?: unknown
  fatal = false
  unhandled = false

  constructor(statusCode: number, message: string, data?: unknown) {
    super(message)
    this.name = 'DomainError'
    this.statusCode = statusCode
    this.data = data
  }

  toJSON() {
    return {
      message: this.message,
      statusCode: this.statusCode,
      ...(this.data === undefined ? {} : { data: this.data }),
    }
  }
}

/** Same call as h3's createError({ statusCode, message, data }). */
export function createError(input: { statusCode: number; message: string; data?: unknown }): DomainError {
  return new DomainError(input.statusCode, input.message, input.data)
}
