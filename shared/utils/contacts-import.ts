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
  name: 'fullName',
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

function kindOf(text: string): ContactKind | null {
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

/** The words that open an Italian surname: «De Luca», «Di Stefano», «La Rosa», «Dell’Acqua». */
const PARTICLES = new Set([
  'd',
  'da',
  'dal',
  'dalla',
  'de',
  'dei',
  'del',
  'della',
  'dello',
  'di',
  'la',
  'lo',
  'li',
  'van',
  'von',
])
const isParticle = (word: string) => PARTICLES.has(word.toLowerCase().replace(/[’']$/, ''))

/**
 * «Mario Rossi»: the first word is the name, the rest the surname. Reversed («Rossi Mario», a «Cognome e
 * nome» column) the surname is the first word with the particles before it: «De Luca Anna».
 */
function splitName(full: string, reversed = false): { firstName: string; lastName: string } {
  const words = full.split(/\s+/).filter(Boolean)
  if (words.length < 2) return { firstName: words[0] ?? '', lastName: '' }
  if (!reversed) return { firstName: words[0]!, lastName: words.slice(1).join(' ') }
  let surname = 1
  while (surname < words.length - 1 && isParticle(words[surname - 1]!)) surname++
  return { firstName: words.slice(surname).join(' '), lastName: words.slice(0, surname).join(' ') }
}

/**
 * The columns named by a header row, or null when the first row is data. The email column is the one whose
 * cells have the @ (emailColumn), whatever its title: «Email genitore», «Recapito».
 */
function headerOf(cells: string[]): Map<Column, number> | null {
  if (cells.some(cell => cell.includes('@'))) return null
  const columns = new Map<Column, number>()
  cells.forEach((cell, index) => {
    const column = HEADERS[normalize(cell)]
    if (column && column !== 'email' && !columns.has(column)) columns.set(column, index)
  })
  return columns.size || cells.some(cell => HEADERS[normalize(cell)] === 'email') ? columns : null
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
  // «Nominativo» (or «Name» in English) holds the whole name; «Nome» alone is the first name only.
  const whole = at('fullName') || at('reversedName')
  let { firstName, lastName } =
    columns.has('lastName') || !whole
      ? { firstName: at('firstName'), lastName: at('lastName') }
      : splitName(whole, !at('fullName'))
  if (!firstName && !lastName) ({ firstName, lastName } = splitName(name))
  return { firstName, lastName, email, kind: kindOf(at('kind')) }
}

/**
 * A row without a header: the cell with the @ is the email, a known type is the type, the rest the name
 * (never a cell with digits: a phone, a CAP). A row of addresses alone, as an email program copies its
 * recipients, is one contact per address.
 */
function byContent(cells: string[]): Fields[] | string {
  const filled = cells.filter(Boolean)
  const emails = filled.filter(cell => cell.includes('@'))
  if (emails.length > 1) {
    if (emails.length < filled.length) return 'Più di un indirizzo nella stessa riga'
    return emails.map(cell => {
      const { name, email } = splitAddress(cell)
      return { ...splitName(name), email, kind: null }
    })
  }
  const { name, email } = splitAddress(emails[0] ?? '')
  let kind: ContactKind | null = null
  const words: string[] = []
  for (const cell of filled) {
    if (cell.includes('@') || /\d/.test(cell)) continue
    const known: ContactKind | null = kind ? null : kindOf(cell)
    if (known) kind = known
    else words.push(cell)
  }
  const names = words.length >= 2 ? { firstName: words[0]!, lastName: words[1]! } : splitName(words[0] || name)
  return [{ ...names, email, kind }]
}

/** The column whose cells most often have the @. */
function emailColumn(rows: string[][]): number | undefined {
  const counts = new Map<number, number>()
  for (const cells of rows) {
    cells.forEach((cell, index) => {
      if (cell.includes('@')) counts.set(index, (counts.get(index) ?? 0) + 1)
    })
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** Every contact of the list, and the rows that cannot be imported, with the reason. */
export function parseContacts(text: string): ParsedContacts {
  const clean = text.replace(/^\uFEFF/, '')
  const rows = rowsOf(clean, separatorOf(clean))
  const firstFilled = rows.findIndex(cells => cells.some(Boolean))
  const columns = firstFilled >= 0 ? headerOf(rows[firstFilled]!) : null
  const contacts: ParsedContact[] = []
  const problems: ContactProblem[] = []
  if (columns) {
    const index = emailColumn(rows.slice(firstFilled + 1))
    if (index === undefined)
      return { contacts, problems: [{ line: firstFilled + 1, reason: 'Manca la colonna dell’email' }] }
    columns.set('email', index)
  }
  const seen = new Map<string, number>()
  rows.forEach((cells, index) => {
    const line = index + 1
    if ((columns && index === firstFilled) || !cells.some(Boolean)) return
    const read = columns ? [byHeader(cells, columns)] : byContent(cells)
    if (typeof read === 'string') return problems.push({ line, reason: read })
    for (const fields of read) {
      if (!fields.email) {
        problems.push({ line, reason: 'Manca l’email' })
        continue
      }
      const parsed = zEmail.safeParse(fields.email)
      if (!parsed.success) {
        problems.push({ line, reason: `Email non valida: ${fields.email}` })
        continue
      }
      const email = parsed.data
      const first = seen.get(email)
      if (first) {
        problems.push({ line, reason: first === line ? 'Email ripetuta nella riga' : `Email già alla riga ${first}` })
        continue
      }
      seen.set(email, line)
      contacts.push({
        line,
        firstName: fields.firstName.slice(0, 100),
        lastName: fields.lastName.slice(0, 100),
        email,
        kind: fields.kind,
      })
    }
  })
  return { contacts, problems }
}
