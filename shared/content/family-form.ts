// The questions of the family data (/famiglia/profilo), after the residence and the composition of the
// family, which have columns of their own (families, family_members). Answers are stored in
// families.form_answers keyed by question id (shared/types/domain.ts, FormAnswers): keep the ids stable,
// and remember that a choice is stored as its label, so renaming an option leaves old answers behind.
import { LODGING_FEATURES, type LodgingFeature } from '../utils/constants'

export type FormQuestionType = 'text' | 'textarea' | 'select' | 'multiselect' | 'boolean'

export interface FormQuestion {
  id: string
  label: string
  type: FormQuestionType
  options?: string[]
  required?: boolean
  help?: string
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

export interface FormSection {
  id: string
  title: string
  description?: string
  questions: FormQuestion[]
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
]

export const FAMILY_FORM_QUESTIONS: FormQuestion[] = FAMILY_FORM_SECTIONS.flatMap(section => section.questions)
