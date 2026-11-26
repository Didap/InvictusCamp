const REFRESH_MS = 30_000

/** Email counters kept fresh while the page is visible. A failed refresh keeps the last numbers. */
export function useLiveEmailData<T>(url: string) {
  const { data, refresh } = useApiFetch<T>(url)
  const visibility = useDocumentVisibility()
  useIntervalFn(() => {
    if (visibility.value === 'visible') refresh()
  }, REFRESH_MS)
  return computed<T | undefined>(previous => (data.value as T | undefined) ?? previous)
}
