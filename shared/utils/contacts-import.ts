// Reads a list of contacts pasted from a spreadsheet (Excel, Google Fogli: cells split by tabs) or from a
// CSV file (semicolons or commas), for the import of the «Anagrafica» (docs/spec.md 3.16). With a header row
// the columns are found by their names (Nome, Cognome, Email, Tipo, «Nome e cognome»…); without one, the
// cell with the @ is the email, the others are the name, then the surname. «Mario Rossi <mario@…>», as an
// email program copies it, works too.
import { zEmail } from '../schemas/common'
import { CONTACT_KINDS, type ContactKind, ENUM_META } from './constants'

export interface ParsedContact {
  /** The row of the list, from 1 (the header counts). */
  line: number
  firstName: string
  lastName: string
  email: string
  /** From the type column, when there is one and its value is a known type. */
  kind: ContactKind | null
}

export interface ContactProblem {
  line: number
  reason: string
}

export interface ParsedContacts {
  contacts: ParsedContact[]
  problems: ContactProblem[]
  /** The first row named the columns. */
  header: boolean
}

type Column = 'firstName' | 'lastName' | 'fullName' | 'reversedName' | 'email' | 'kind'

/** Letters only, lowercase, no accents: «E-mail » and «email» match. */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

const HEADERS: Record<string, Column> = {
  nome: 'firstName',
  firstname: 'firstName',
  name: 'firstName',
  givenname: 'firstName',
  cognome: 'lastName',
  lastname: 'lastName',
  surname: 'lastName',
  familyname: 'lastName',
  nomeecognome: 'fullName',
  nomecognome: 'fullName',
  nominativo: 'fullName',
  fullname: 'fullName',
  nomecompleto: 'fullName',
  contatto: 'fullName',
  cognomeenome: 'reversedName',
  cognomenome: 'reversedName',
  email: 'email',
  mail: 'email',
  indirizzoemail: 'email',
  indirizzomail: 'email',
  postaelettronica: 'email',
  emailaddress: 'email',
  tipo: 'kind',
  tipologia: 'kind',
  categoria: 'kind',
  type: 'kind',
  ruolo: 'kind',
}

/** The words a type column may hold, besides the labels of the interface. */
const KIND_WORDS: Record<string, ContactKind> = {
  ...Object.fromEntries(CONTACT_KINDS.map(kind => [normalize(ENUM_META.contactKind[kind].label), kind])),
  ...Object.fromEntries(CONTACT_KINDS.map(kind => [kind, kind])),
  famiglie: 'family',
  vteam: 'volunteer',
  volontario: 'volunteer',
  volontaria: 'volunteer',
  volontari: 'volunteer',
  sostenitrice: 'supporter',
  sostenitori: 'supporter',
  donatore: 'supporter',
  donatrice: 'supporter',
  donatori: 'supporter',
  ente: 'partner',
  enti: 'partner',
  associazione: 'partner',
  scuola: 'partner',
  azienda: 'partner',
}

export function kindOf(text: string): ContactKind | null {
  return KIND_WORDS[normalize(text)] ?? null
}

/** The separator of the cells: tabs when pasted from a spreadsheet, else the more frequent of ; and ,. */
function separatorOf(text: string): string | null {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n')
  if (sample.includes('\t')) return '\t'
  const semicolons = sample.split(';').length
  const commas = sample.split(',').length
  if (semicolons === 1 && commas === 1) return null
  return semicolons >= commas ? ';' : ','
}

/** The rows of the text, each a list of cells; quotes as in CSV ("a;b", "a ""b"""). */
function rowsOf(text: string, separator: string | null): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char !== '"') cell += char
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (char === '"' && !cell.trim()) {
      quoted = true
      cell = ''
    } else if (char === separator) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      rows.push([...row, cell])
      row = []
      cell = ''
    } else cell += char
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows.map(cells => cells.map(value => value.trim()))
}

/** «Mario Rossi <mario@x.it>»: the name and the address; a bare address has no name. */
function splitAddress(cell: string): { name: string; email: string } {
  const match = /^(.*?)\s*<([^<>]+@[^<>]+)>$/.exec(cell)
  return match ? { name: match[1]!.replace(/^"|"$/g, '').trim(), email: match[2]! } : { name: '', email: cell }
}

/** «Mario Rossi»: the first word is the name, the rest the surname (reversed: «Rossi Mario»). */
function splitName(full: string, reversed = false): { firstName: string; lastName: string } {
  const words = full.split(/\s+/).filter(Boolean)
  if (words.length < 2) return { firstName: words[0] ?? '', lastName: '' }
  return reversed
    ? { firstName: words.slice(1).join(' '), lastName: words[0]! }
    : { firstName: words[0]!, lastName: words.slice(1).join(' ') }
}

/** The columns named by a header row, or null when the first row is data. */
function headerOf(cells: string[]): Map<Column, number> | null {
  if (cells.some(cell => cell.includes('@'))) return null
  const columns = new Map<Column, number>()
  cells.forEach((cell, index) => {
    const column = HEADERS[normalize(cell)]
    if (column && !columns.has(column)) columns.set(column, index)
  })
  return columns.size ? columns : null
}

interface Fields {
  firstName: string
  lastName: string
  email: string
  kind: ContactKind | null
}

/** A row read through the columns of the header. */
function byHeader(cells: string[], columns: Map<Column, number>): Fields {
  const at = (column: Column) => {
    const index = columns.get(column)
    return index === undefined ? '' : (cells[index] ?? '')
  }
  const { name, email } = splitAddress(at('email'))
  // Without a surname column, one column holds the whole name («Nominativo», or «Name» in English).
  let { firstName, lastName } = columns.has('lastName')
    ? { firstName: at('firstName'), lastName: at('lastName') }
    : splitName(at('fullName') || at('reversedName') || at('firstName'), !at('fullName') && Boolean(at('reversedName')))
  if (!firstName && !lastName) ({ firstName, lastName } = splitName(name))
  return { firstName, lastName, email, kind: kindOf(at('kind')) }
}

/** A row without a header: the cell with the @ is the email, a known type is the type, the rest the name. */
function byContent(cells: string[]): Fields | string {
  const emails = cells.filter(cell => cell.includes('@'))
  if (emails.length > 1) return 'Più di un indirizzo nella stessa riga'
  const { name, email } = splitAddress(emails[0] ?? '')
  let kind: ContactKind | null = null
  const words: string[] = []
  for (const cell of cells) {
    if (!cell || cell.includes('@')) continue
    const known: ContactKind | null = kind ? null : kindOf(cell)
    if (known) kind = known
    else words.push(cell)
  }
  const names = words.length >= 2 ? { firstName: words[0]!, lastName: words[1]! } : splitName(words[0] || name)
  return { ...names, email, kind }
}

/** Every contact of the list, and the rows that cannot be imported, with the reason. */
export function parseContacts(text: string): ParsedContacts {
  const clean = text.replace(/^\uFEFF/, '')
  const rows = rowsOf(clean, separatorOf(clean))
  const firstFilled = rows.findIndex(cells => cells.some(Boolean))
  const columns = firstFilled >= 0 ? headerOf(rows[firstFilled]!) : null
  const contacts: ParsedContact[] = []
  const problems: ContactProblem[] = []
  if (columns && !columns.has('email')) {
    return { contacts, problems: [{ line: firstFilled + 1, reason: 'Manca la colonna dell’email' }], header: true }
  }
  const seen = new Map<string, number>()
  rows.forEach((cells, index) => {
    const line = index + 1
    if ((columns && index === firstFilled) || !cells.some(Boolean)) return
    const fields = columns ? byHeader(cells, columns) : byContent(cells)
    if (typeof fields === 'string') return problems.push({ line, reason: fields })
    if (!fields.email) return problems.push({ line, reason: 'Manca l’email' })
    const parsed = zEmail.safeParse(fields.email)
    if (!parsed.success) return problems.push({ line, reason: `Email non valida: ${fields.email}` })
    const email = parsed.data
    const first = seen.get(email)
    if (first) return problems.push({ line, reason: `Email già alla riga ${first}` })
    seen.set(email, line)
    contacts.push({
      line,
      firstName: fields.firstName.slice(0, 100),
      lastName: fields.lastName.slice(0, 100),
      email,
      kind: fields.kind,
    })
  })
  return { contacts, problems, header: Boolean(columns) }
}
