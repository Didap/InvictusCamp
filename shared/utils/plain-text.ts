// Plain text the administration writes (a message, the release of a family): its paragraphs, and the fields
// in braces it fills by itself for each recipient.
import { orList } from './format'

/**
 * The paragraphs of a text: blank lines separate them, a single line break stays one (joined by `lineBreak`).
 * Lines lose their trailing spaces, paragraphs their blank edges, empty paragraphs go.
 */
export function textParagraphs(text: string, lineBreak = '\n'): string[] {
  return text
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .split(/\n[ \t]*\n/)
    .map(paragraph =>
      paragraph
        .split('\n')
        .map(line => line.trimEnd())
        .join(lineBreak)
        .trim(),
    )
    .filter(Boolean)
}

/** A field written well: letters, digits, underscore. */
export const FIELD = /\{([\p{L}\d_]+)\}/gu

/** The fields of one kind of text: which names exist, how to fill them, what to say of one that does not exist. */
export function textFields<Name extends string>(names: readonly Name[]) {
  const isField = (name: string): name is Name => (names as readonly string[]).includes(name)
  const list = orList(names.map(name => `{${name}}`))
  return {
    isField,
    /** Writes the values in; fields without a value, and anything else in braces, stay as they are. */
    fill: (text: string, values: Partial<Record<Name, string>>) =>
      text.replace(FIELD, (match, name: string) => (isField(name) ? (values[name] ?? match) : match)),
    /** What to say of a field in braces that does not fill itself. */
    unknown: (field: string) => `${field} non si compila da solo: usa ${list}.`,
  }
}
