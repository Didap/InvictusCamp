// Helpers for plain data (JSON-like values): ids made in the browser, copies, comparisons. Used by the
// editors of the programme and of the family questionnaire, and by the server for the same data.

/** A new id: `prefix` then time and randomness. Not crypto.randomUUID: that exists only on HTTPS and localhost. */
export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/** A deep copy of plain data (also of a reactive proxy, which structuredClone refuses). */
export function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

/** Same content (a week, a questionnaire), whatever the order of the keys (jsonb reorders them, a form does not). */
export function sameContent<T>(a: T, b: T): boolean {
  return canonical(a) === canonical(b)
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)))
      : item,
  )
}

/** Moves the item at `index` by `by` places (-1 one up, 1 one down) in place. */
export function moveAt<T>(list: T[], index: number, by: number): void {
  const [item] = list.splice(index, 1)
  list.splice(index + by, 0, item!)
}

/** The keys whose values differ between two records, whatever their fields (null and missing are the same). */
export function changedKeys(before: object | null, after: object | null): string[] {
  const a: Record<string, unknown> = { ...before }
  const b: Record<string, unknown> = { ...after }
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    key => JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null),
  )
}
