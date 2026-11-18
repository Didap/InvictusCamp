// The text of the release (docs/spec.md 3.8): the camp's text filled with the family, paragraph by paragraph.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RELEASE_TEXT,
  releaseFieldIssue,
  releaseText,
  SAMPLE_RELEASE_INPUT,
} from '../../shared/content/release'
import { releaseTextSaveSchema } from '../../shared/schemas/releases'

describe('release text', () => {
  it('fills the draft with the family', () => {
    const { title, paragraphs } = releaseText(DEFAULT_RELEASE_TEXT, SAMPLE_RELEASE_INPUT)
    expect(title).toBe('Liberatoria · Famiglia Rossi')
    expect(paragraphs[0]).toMatch(/^Anna Rossi, referente della Famiglia Rossi, chiede/)
    // {componenti} alone: one line per member, in one paragraph.
    expect(paragraphs[2]).toBe(
      'Anna Rossi, data di nascita 12 apr 1985, genitore\nMarco Rossi, data di nascita 3 set 1983, genitore\nLuca Rossi, data di nascita 21 giu 2015',
    )
    expect(paragraphs[3]).toBe('Anna Rossi autorizza foto e riprese video durante il soggiorno.')
    expect(paragraphs[4]).toBe('Anna Rossi non autorizza la pubblicazione di foto e video sui canali del camp.')
    expect(paragraphs.join(' ')).not.toMatch(/[{}]/)
  })

  it('writes the names inside a sentence, keeps line breaks and drops empty paragraphs', () => {
    const body = 'Per {componenti}:\r\nprima riga\r\nseconda riga\r\n\r\n  \r\n\r\n{foto}'
    expect(releaseText(body, SAMPLE_RELEASE_INPUT).paragraphs).toEqual([
      'Per Anna Rossi, Marco Rossi e Luca Rossi:\nprima riga\nseconda riga',
      'autorizza',
    ])
  })

  it('refuses a field it cannot fill', () => {
    expect(releaseFieldIssue('Il {referente} della {famiglia}')).toBeNull()
    expect(releaseFieldIssue('Codice fiscale: {codice_fiscale}')).toMatch(/^\{codice_fiscale\} non si compila da solo/)
    const check = releaseTextSaveSchema.safeParse({ revision: 0, body: 'Nato a {luogo}' })
    expect(check.success).toBe(false)
    expect(releaseTextSaveSchema.safeParse({ revision: 0, body: '   ' }).success).toBe(false)
  })
})
