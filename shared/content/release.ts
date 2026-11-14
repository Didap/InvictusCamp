// The release (liberatoria) of a family (docs/spec.md 3.8): generated from its cards and its answers in
// «Dati della famiglia», signed in Documenti. A DRAFT text: the camp gives the final one. No health data.
import { enumLabel, type MemberRelationship } from '../utils/constants'
import { formatDay } from '../utils/format'

export interface ReleaseInput {
  familyName: string
  members: { name: string; birthDate: string | null; relationship: MemberRelationship | null }[]
  photoConsent: boolean
  publicationConsent: boolean
}

/** Title and paragraphs of the release: the same input gives the same text (its digest says when to redo it). */
export function releaseText(input: ReleaseInput): { title: string; paragraphs: string[] } {
  const yes = (given: boolean, what: string) => `${what}: ${given ? 'autorizzate' : 'non autorizzate'}.`
  return {
    title: `Liberatoria · ${input.familyName}`,
    paragraphs: [
      'Il sottoscritto, referente del nucleo familiare, chiede la partecipazione alle attività di Invictus Camp per sé e per le persone indicate di seguito, e dichiara di aver letto il regolamento del camp.',
      'Componenti del nucleo familiare:',
      ...input.members.map(member =>
        [
          member.name,
          member.birthDate ? `data di nascita ${formatDay(member.birthDate)}` : null,
          member.relationship ? enumLabel('memberRelationship', member.relationship).toLowerCase() : null,
        ]
          .filter(Boolean)
          .join(', '),
      ),
      yes(input.photoConsent, 'Foto e riprese video durante il soggiorno'),
      yes(input.publicationConsent, 'Pubblicazione di foto e video sui canali del camp'),
      'Dichiara di aver ricevuto l’informativa sul trattamento dei dati personali ai sensi del Regolamento UE 2016/679.',
    ],
  }
}
