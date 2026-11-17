// The questions of the family data (/famiglia/profilo), after the residence and the composition of the
// family, which have columns of their own (families, family_members). The administration changes them from
// /admin/famiglie/modulo (table `questionnaires`, server/domain/questionnaires.ts): what is here is only the
// starting form, used until the first save there. Answers are stored in families.form_answers keyed by
// question id (shared/types/domain.ts, FormAnswers), a choice as the text of its option.
import { LODGING_FEATURES, type FormQuestionType, type LodgingFeature } from '../utils/constants'

export interface FormQuestion {
  id: string
  label: string
  type: FormQuestionType
  options?: string[]
  required?: boolean
  help?: string
}

export interface FormSection {
  id: string
  title: string
  description?: string
  questions: FormQuestion[]
}

/**
 * The questionnaire as the administration last saved it. `retired` keeps the questions taken out of it, so
 * the record of a family still shows what it answered to them.
 */
export interface FamilyFormContent {
  sections: FormSection[]
  retired: FormQuestion[]
}

/**
 * The answers of `accommodationNeeds`, one per lodging feature: the Alloggi tab of a session flags a family
 * placed in a lodging without what it asked for (shared/utils/lodgings.ts, accommodationNeeds).
 */
export const ACCOMMODATION_NEED_LABELS: Readonly<Record<LodgingFeature, string>> = {
  kitchen: 'Cucina',
  accessible_bathroom: 'Bagno senza barriere architettoniche',
  microwave: 'Microonde',
}

export const FAMILY_FORM_SECTIONS: FormSection[] = [
  {
    id: 'about',
    title: 'Come ci hai conosciuto',
    questions: [
      {
        id: 'howDidYouHear',
        label: 'Come hai scoperto Invictus Camp?',
        type: 'select',
        options: ['Passaparola', 'Social network', 'Associazione o ente', 'Struttura sanitaria', 'Altro'],
        required: true,
      },
      {
        id: 'association',
        label: 'Associazione di appartenenza',
        type: 'text',
        help: 'Se la tua famiglia fa parte di un’associazione, scrivi quale.',
      },
    ],
  },
  {
    id: 'stay',
    title: 'Il soggiorno',
    questions: [
      {
        id: 'sessionPreferences',
        label: 'Quali sessioni preferisci?',
        type: 'multiselect',
        options: ['Sessioni nel weekend (2 notti)', 'Sessioni settimanali estive (4 notti)'],
        required: true,
        help: 'Puoi sceglierle entrambe.',
      },
      {
        id: 'accommodationNeeds',
        label: 'Esigenze per l’alloggio',
        type: 'multiselect',
        options: LODGING_FEATURES.map(feature => ACCOMMODATION_NEED_LABELS[feature]),
        help: 'Scegli solo quello che ti serve.',
      },
      {
        id: 'dog',
        label: 'Avete un cane che viaggia con voi?',
        type: 'boolean',
        required: true,
        help: 'I cani non possono stare negli appartamenti del camp. Se viene con voi, ti diamo i contatti delle pensioni per cani della zona: il costo è a carico della famiglia, non del camp.',
      },
    ],
  },
  {
    id: 'release',
    title: 'Liberatoria',
    description:
      'Le tue risposte finiscono nella liberatoria che prepariamo con i dati dei componenti: la trovi da firmare in Documenti.',
    questions: [
      {
        id: 'photoConsent',
        label: 'Autorizzi foto e riprese video della tua famiglia durante il soggiorno?',
        type: 'boolean',
        required: true,
        help: 'Servono a documentare le attività del camp.',
      },
      {
        id: 'publicationConsent',
        label: 'Autorizzi la pubblicazione di foto e video sui canali del camp?',
        type: 'boolean',
        required: true,
        help: 'Sito, social e materiali informativi di Invictus Camp.',
      },
    ],
  },
]

/** The form used until the administration saves one. */
export const DEFAULT_FAMILY_FORM: FamilyFormContent = { sections: FAMILY_FORM_SECTIONS, retired: [] }

/**
 * The questions the code reads, with what reads them: the administration changes their text and their
 * place, never their id, type, options or whether they are required, and cannot take them out.
 */
export const LOCKED_QUESTIONS: Readonly<Record<string, string>> = {
  accommodationNeeds:
    'La legge la pagina Alloggi, che segnala le famiglie messe in un alloggio senza quello che hanno chiesto.',
  photoConsent: 'La legge la liberatoria da firmare, che riporta questo consenso con una formula sua.',
  publicationConsent: 'La legge la liberatoria da firmare, che riporta questo consenso con una formula sua.',
}

/** Why the code needs the question `id`, when it does. */
export function lockedReason(id: string): string | undefined {
  return Object.hasOwn(LOCKED_QUESTIONS, id) ? LOCKED_QUESTIONS[id] : undefined
}

export function formQuestions(form: Pick<FamilyFormContent, 'sections'>): FormQuestion[] {
  return form.sections.flatMap(section => section.questions)
}
