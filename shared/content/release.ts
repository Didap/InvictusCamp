// The release (liberatoria) of a family (docs/spec.md 3.8): the camp's text, edited from
// /admin/famiglie/liberatoria (table release_texts; until the first save the draft below), filled with the
// family's cards and its answers in «Dati della famiglia», signed in Documenti. No health data: no field
// carries any.
import { enumLabel, type MemberRelationship } from '../utils/constants'
import { andList, formatDay, orList } from '../utils/format'

export interface ReleaseInput {
  familyName: string
  /** Who signs: the holder of the family's account. */
  referent: string
  members: { name: string; birthDate: string | null; relationship: MemberRelationship | null }[]
  photoConsent: boolean
  publicationConsent: boolean
}

const RELEASE_FIELDS = ['famiglia', 'referente', 'componenti', 'foto', 'pubblicazione'] as const
type ReleaseField = (typeof RELEASE_FIELDS)[number]
/** What the family signs for: without them the release would not say who comes and what they allowed. */
const REQUIRED_FIELDS: ReleaseField[] = ['componenti', 'foto', 'pubblicazione']

export const RELEASE_TEXT_MAX = 20_000

/** The help under the text in the editor. */
export const RELEASE_FIELDS_HELP =
  'Si compilano da soli per ogni famiglia: {famiglia}, {referente} (chi firma: chi ha l’account della famiglia), {foto} e {pubblicazione} («autorizza» o «non autorizza», come ha risposto la famiglia). {componenti} da solo in un paragrafo diventa l’elenco dei componenti con data di nascita e parentela; dentro una frase, i loro nomi. {componenti}, {foto} e {pubblicazione} devono esserci. Una riga vuota separa i paragrafi.'

/** The draft the families sign until the camp saves its own text. */
export const DEFAULT_RELEASE_TEXT = `{referente}, referente della {famiglia}, chiede la partecipazione alle attività di Invictus Camp per sé e per le persone indicate di seguito, e dichiara di aver letto il regolamento del camp.

Componenti del nucleo familiare:

{componenti}

{referente} {foto} foto e riprese video durante il soggiorno.

{referente} {pubblicazione} la pubblicazione di foto e video sui canali del camp.

Dichiara di aver ricevuto l’informativa sul trattamento dei dati personali ai sensi del Regolamento UE 2016/679.`

/** The family the editor's preview fills the text with. */
export const SAMPLE_RELEASE_INPUT: ReleaseInput = {
  familyName: 'Famiglia Rossi',
  referent: 'Anna Rossi',
  members: [
    { name: 'Anna Rossi', birthDate: '1985-04-12', relationship: 'parent' },
    { name: 'Marco Rossi', birthDate: '1983-09-03', relationship: 'parent' },
    { name: 'Luca Rossi', birthDate: '2015-06-21', relationship: null },
  ],
  photoConsent: true,
  publicationConsent: false,
}

const FIELD = /\{([\p{L}\d_]+)\}/gu
/** Anything in braces on one line, written well or not: "{ foto }", "{data-nascita}", "{}". */
const BRACED = /\{[^{}\n]*\}/g
const FIELD_LIST = orList(RELEASE_FIELDS.map(name => `{${name}}`))
const isField = (name: string): name is ReleaseField => (RELEASE_FIELDS as readonly string[]).includes(name)

/**
 * What stops the text from being a release, or null: a field in braces it cannot fill ("{cognome}",
 * "{ foto }"), a brace left alone, a required field missing.
 */
export function releaseFieldIssue(body: string): string | null {
  for (const [field] of body.matchAll(BRACED)) {
    if (!isField(field.slice(1, -1))) return `${field} non si compila da solo: usa ${FIELD_LIST}.`
  }
  if (/[{}]/.test(body.replace(BRACED, ''))) {
    return 'C’è una parentesi graffa aperta o chiusa da sola: le graffe servono solo per i campi, come {famiglia}.'
  }
  const missing = REQUIRED_FIELDS.filter(name => !body.includes(`{${name}}`))
  if (!missing.length) return null
  return `${missing.length === 1 ? 'Manca' : 'Mancano'} ${andList(missing.map(name => `{${name}}`))}: la famiglia firma anche per questo.`
}

const consent = (given: boolean) => (given ? 'autorizza' : 'non autorizza')

function memberLine(member: ReleaseInput['members'][number]): string {
  return [
    member.name,
    member.birthDate ? `data di nascita ${formatDay(member.birthDate)}` : null,
    member.relationship ? enumLabel('memberRelationship', member.relationship).toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(', ')
}

/**
 * Title and paragraphs of the release: blank lines separate the paragraphs, a line break stays one. The same
 * text and input give the same result (its digest says when to redo the release).
 */
export function releaseText(body: string, input: ReleaseInput): { title: string; paragraphs: string[] } {
  const values: Record<ReleaseField, string> = {
    famiglia: input.familyName,
    referente: input.referent,
    componenti: andList(input.members.map(member => member.name)),
    foto: consent(input.photoConsent),
    pubblicazione: consent(input.publicationConsent),
  }
  const fill = (text: string) => text.replace(FIELD, (match, name: string) => (isField(name) ? values[name] : match))
  return {
    title: `Liberatoria · ${input.familyName}`,
    paragraphs: body
      .replace(/\r\n?/g, '\n')
      .split(/\n[ \t]*\n/)
      .map(paragraph => paragraph.trim())
      .map(paragraph => (paragraph === '{componenti}' ? input.members.map(memberLine).join('\n') : fill(paragraph)))
      .filter(Boolean),
  }
}
