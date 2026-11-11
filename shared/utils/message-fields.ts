// The fields of a written message filled for each recipient (docs/spec.md, 3.7), and the parts in square
// brackets that a template leaves to complete by hand before sending.
import type { IsoDay } from './dates'
import { formatDayRange } from './format'

/** {nome}: the first name of the recipient; {sessione} and {date}: the title and the days of the session. */
export const MESSAGE_FIELDS = ['nome', 'sessione', 'date'] as const
export type MessageField = (typeof MESSAGE_FIELDS)[number]

/** The help under the text of a message and of a template. */
export const MESSAGE_FIELDS_HELP =
  'Si compilano da soli per ogni destinatario {nome} e, se scrivi a una sessione, {sessione} e {date}. Le parti tra parentesi quadre vanno completate prima dell’invio.'

export type MessageFieldValues = Partial<Record<MessageField, string>>

/** Filled only when the message goes to the families or the staff of a session. */
const SESSION_FIELDS: readonly string[] = ['sessione', 'date'] satisfies MessageField[]
const FIELD_LIST = MESSAGE_FIELDS.map(name => `{${name}}`).join(', ')
const FIELD = /\{([\p{L}\d_]+)\}/gu
const TO_COMPLETE = /\[[^\]\n]+\]/

const isField = (name: string): name is MessageField => (MESSAGE_FIELDS as readonly string[]).includes(name)

/** The values of the fields for one recipient; a session field stays as written when there is no session. */
export function messageFieldValues(
  firstName: string | null | undefined,
  session: { title: string; startDate: IsoDay; endDate: IsoDay } | null | undefined,
): MessageFieldValues {
  return {
    ...(firstName ? { nome: firstName } : {}),
    ...(session ? { sessione: session.title, date: formatDayRange(session.startDate, session.endDate, 'long') } : {}),
  }
}

/** Writes the values in; fields without a value, and anything else in braces, stay as they are. */
export function fillMessageFields(text: string, values: MessageFieldValues): string {
  return text.replace(FIELD, (match, name: string) => (isField(name) ? (values[name] ?? match) : match))
}

/** The first field in braces that is not filled by itself ("{cognome}"), or null. */
export function unknownFieldIssue(text: string): string | null {
  for (const [, name] of text.matchAll(FIELD)) {
    if (!isField(name!)) return `{${name}} non si compila da solo: usa ${FIELD_LIST}.`
  }
  return null
}

/** What stops a message from leaving as written, or null. */
export function messageIssue(text: string, hasSession: boolean): string | null {
  const blank = TO_COMPLETE.exec(text)
  if (blank) return `Completa ${blank[0]} prima dell’invio.`
  const unknown = unknownFieldIssue(text)
  if (unknown) return unknown
  if (hasSession) return null
  const sessionField = [...text.matchAll(FIELD)].find(([, name]) => SESSION_FIELDS.includes(name!))
  return sessionField
    ? `${sessionField[0]} si compila solo se scrivi alle famiglie o allo staff di una sessione.`
    : null
}
