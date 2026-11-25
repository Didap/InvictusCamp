import type { FormErrorEvent } from '@nuxt/ui'
import type { ApiIssue } from '#shared/types/api'

interface ApiErrorBody {
  message?: string
  statusMessage?: string
  data?: { issues?: ApiIssue[]; reason?: string }
}

interface FetchErrorLike {
  name?: string
  statusCode?: number
  data?: ApiErrorBody
}

/** The `data` the server attached to an error (createError({ data })), e.g. { reason } or { issues }. */
export function apiErrorData(error: unknown): ApiErrorBody['data'] | undefined {
  return (error as FetchErrorLike | null)?.data?.data
}

/** The Italian message of an API error, or a fallback. */
export function apiErrorMessage(error: unknown, fallback = 'Qualcosa non ha funzionato: riprova'): string {
  const e = error as FetchErrorLike | null
  if (e?.data?.message) return e.data.message
  if (e?.statusCode === 413) return 'Il file è troppo grande'
  if (e?.name === 'FetchError' && !e.statusCode) return 'Connessione assente: controlla la rete e riprova'
  return fallback
}

// Nuxt UI's useToast() calls inject(): after an `await` in an event handler there is no component
// instance, so it runs in the app context (no "inject() can only be used inside setup()" warning).
const toast = () => useNuxtApp().vueApp.runWithContext(() => useToast())

export function notifyError(error: unknown, title = 'Operazione non riuscita') {
  toast().add({ title, description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
}

export function notifySuccess(title: string, description?: string) {
  toast().add({ title, description, color: 'success', icon: 'i-lucide-circle-check' })
}

/** A form's `@error`: brings the first field with an error into view and puts the focus on its control. */
export function focusFirstError(event: FormErrorEvent) {
  const id = event.errors[0]?.id
  const field = id ? document.getElementById(id) : null
  if (!field) return
  field.scrollIntoView({ block: 'center' })
  // A group of choices carries the id on its wrapper: its first control takes the focus.
  const control = field.matches('input, textarea, button, select')
    ? field
    : field.querySelector<HTMLElement>('input, textarea, button')
  control?.focus({ preventScroll: true })
}
