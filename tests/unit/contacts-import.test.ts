// The list pasted into the import of the «Anagrafica» (docs/spec.md 3.16).
import { describe, expect, it } from 'vitest'
import { parseContacts } from '../../shared/utils/contacts-import'

const fields = (text: string) =>
  parseContacts(text).contacts.map(({ firstName, lastName, email, kind }) => [firstName, lastName, email, kind])

describe('parseContacts', () => {
  it('reads a CSV of Excel in Italian by the names of its columns, in any order', () => {
    const csv =
      '\uFEFFEmail;Cognome;Nome;Tipo\r\nMARIO@Example.it;Rossi;Mario;Famiglia\r\nanna@example.it;Bianchi;Anna;donatrice\r\n'
    const parsed = parseContacts(csv)
    expect(parsed.header).toBe(true)
    expect(parsed.problems).toEqual([])
    expect(fields(csv)).toEqual([
      ['Mario', 'Rossi', 'mario@example.it', 'family'],
      ['Anna', 'Bianchi', 'anna@example.it', 'supporter'],
    ])
  })

  it('reads cells pasted from a spreadsheet, without a header', () => {
    expect(fields('Mario\tRossi\tmario@example.it\nGiulia\tVerdi\tgiulia@example.it\tStaff\n')).toEqual([
      ['Mario', 'Rossi', 'mario@example.it', null],
      ['Giulia', 'Verdi', 'giulia@example.it', 'staff'],
    ])
  })

  it('reads a column of addresses alone, and «Nome <email>» as an email program copies it', () => {
    expect(fields('mario@example.it\n\n"Anna Maria Bianchi" <anna@example.it>\n')).toEqual([
      ['', '', 'mario@example.it', null],
      ['Anna', 'Maria Bianchi', 'anna@example.it', null],
    ])
  })

  it('splits a single name column, also surname first', () => {
    expect(fields('Nominativo,Email\nMario Rossi,mario@example.it')).toEqual([
      ['Mario', 'Rossi', 'mario@example.it', null],
    ])
    expect(fields('Cognome e nome;Email\nDe Luca Anna;anna@example.it\nDell’Acqua Maria Grazia;mg@example.it')).toEqual(
      [
        ['Anna', 'De Luca', 'anna@example.it', null],
        ['Maria Grazia', 'Dell’Acqua', 'mg@example.it', null],
      ],
    )
    expect(fields('Name,Email\nMario Rossi,mario@example.it')).toEqual([['Mario', 'Rossi', 'mario@example.it', null]])
    // «Nome» alone is the first name: «Maria Grazia» is not split.
    expect(fields('Nome;Email\nMaria Grazia;mg@example.it')).toEqual([['Maria Grazia', '', 'mg@example.it', null]])
  })

  it('finds the email column by a title with «mail» or by its @', () => {
    expect(fields('Nome;Cognome;Email genitore\nMario;Rossi;mario@example.it')).toEqual([
      ['Mario', 'Rossi', 'mario@example.it', null],
    ])
    expect(fields('Nome;Cognome;Recapito\nMario;Rossi;mario@example.it')).toEqual([
      ['Mario', 'Rossi', 'mario@example.it', null],
    ])
  })

  it('never takes a phone or a CAP for a surname', () => {
    expect(fields('Mario Rossi\t333 1234567\tmario@example.it\t74024')).toEqual([
      ['Mario', 'Rossi', 'mario@example.it', null],
    ])
  })

  it('reads the recipients an email program copies on one line', () => {
    expect(fields('"Mario Rossi" <mario@example.it>, Anna Bianchi <anna@example.it>, luca@example.it')).toEqual([
      ['Mario', 'Rossi', 'mario@example.it', null],
      ['Anna', 'Bianchi', 'anna@example.it', null],
      ['', '', 'luca@example.it', null],
    ])
  })

  it('keeps quoted cells whole', () => {
    expect(fields('Nome;Cognome;Email\n"Rossi; Mario";"D""Amico";m@example.it')).toEqual([
      ['Rossi; Mario', 'D"Amico', 'm@example.it', null],
    ])
  })

  it('says which rows are left out, and why', () => {
    const parsed = parseContacts(
      'Nome;Email\nMario;mario@example.it\nAnna;non-valida\nLuca;\nMario bis;MARIO@example.it\nDue;a@example.it b@example.it',
    )
    expect(parsed.contacts.map(contact => contact.line)).toEqual([2])
    expect(parsed.problems).toEqual([
      { line: 3, reason: 'Email non valida: non-valida' },
      { line: 4, reason: 'Manca l’email' },
      { line: 5, reason: 'Email già alla riga 2' },
      { line: 6, reason: 'Email non valida: a@example.it b@example.it' },
    ])
  })

  it('refuses a list without addresses, and two addresses in a row with a name', () => {
    expect(parseContacts('Nome;Cognome\nMario;Rossi').problems).toEqual([
      { line: 1, reason: 'Manca la colonna dell’email' },
    ])
    expect(parseContacts('Mario;a@example.it;b@example.it').problems).toEqual([
      { line: 1, reason: 'Più di un indirizzo nella stessa riga' },
    ])
  })
})
