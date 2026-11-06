import type { H3Event } from 'h3'
import type { z } from 'zod'
import type { ApiIssue } from '#shared/types/api'

function invalid(issues: z.core.$ZodIssue[]): never {
  const list: ApiIssue[] = issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))
  throw createError({
    statusCode: 400,
    message: list[0]?.message ? `Dati non validi: ${list[0].message}` : 'Dati non validi',
    data: { issues: list },
  })
}

/** Reads and validates the JSON body; 400 with the list of issues when it does not match. */
export async function parseBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  const body = await readBody(event).catch(() => undefined)
  const result = schema.safeParse(body ?? {})
  if (!result.success) invalid(result.error.issues)
  return result.data
}

/** Validates the query string. */
export function parseQuery<T extends z.ZodType>(event: H3Event, schema: T): z.output<T> {
  const result = schema.safeParse(getQuery(event))
  if (!result.success) invalid(result.error.issues)
  return result.data
}
