// The fields of a written message filled for each recipient (docs/spec.md, 3.7), and the parts in square
// brackets that a template leaves to complete by hand before sending.
import type { DayRange } from './dates'
import { formatDayRange, orList } from './format'

/** {nome}: the first name of the recipient; {sessione} and {date}: the title and the days of the session. */
const MESSAGE_FIELDS = ['nome', 'sessione', 'date'] as const
type MessageField = (typeof MESSAGE_FIELDS)[number]
/** What {sessione} and {date} are written from. */
export type FieldSession = DayRange & { title: string }

/** The help under the text of a message and of a template. */
export const MESSAGE_FIELDS_HELP =
  'Si compilano da soli per ogni destinatario {nome} e, se scrivi a una sessione, {sessione} e {date}. Le parti tra parentesi quadre vanno completate prima dell’invio.'

const FIELD = /\{([\p{L}\d_]+)\}/gu
const TO_COMPLETE = /\[[^\]\n]+\]/
const FIELD_LIST = orList(MESSAGE_FIELDS.map(name => `{${name}}`))

const isField = (name: string): name is MessageField => (MESSAGE_FIELDS as readonly string[]).includes(name)

/** The values of the fields for one recipient; a field without a value stays as written. */
export function messageFieldValues(
  firstName: string | null | undefined,
  session: FieldSession | null | undefined,
): Partial<Record<MessageField, string>> {
  return {
    nome: firstName || undefined,
    sessione: session?.title,
    date: session ? formatDayRange(session.startDate, session.endDate, 'long') : undefined,
  }
}

/** Writes the values in; fields without a value, and anything else in braces, stay as they are. */
export function fillMessageFields(text: string, values: Partial<Record<MessageField, string>>): string {
  return text.replace(FIELD, (match, name: string) => (isField(name) ? (values[name] ?? match) : match))
}

/**
 * The first field in braces that cannot be filled, or null: one that does not exist ("{cognome}"), or a
 * session field when the message does not go to a session.
 */
export function fieldIssue(text: string, hasSession = true): string | null {
  for (const [field, name] of text.matchAll(FIELD)) {
    if (!isField(name!)) return `${field} non si compila da solo: usa ${FIELD_LIST}.`
    if (!hasSession && name !== 'nome') {
      return `${field} si compila solo se scrivi alle famiglie o allo staff di una sessione.`
    }
  }
  return null
}

/** What stops a message from leaving as written, or null. */
export function messageIssue(text: string, hasSession: boolean): string | null {
  const blank = TO_COMPLETE.exec(text)
  return blank ? `Completa ${blank[0]} prima dell’invio.` : fieldIssue(text, hasSession)
}
