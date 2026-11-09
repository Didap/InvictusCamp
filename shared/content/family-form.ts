// The questions of the family data (/famiglia/profilo), after the residence and the composition of the
// family, which have columns of their own (families, family_members). Answers are stored in
// families.form_answers keyed by question id (shared/types/domain.ts, FormAnswers): keep the ids stable,
// and remember that a choice is stored as its label, so renaming an option leaves old answers behind.

export type FormQuestionType = 'text' | 'textarea' | 'select' | 'multiselect' | 'boolean'

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
        options: ['Cucina', 'Bagno senza barriere architettoniche', 'Microonde'],
        help: 'Scegli solo quello che ti serve.',
      },
    ],
  },
]

export const FAMILY_FORM_QUESTIONS: FormQuestion[] = FAMILY_FORM_SECTIONS.flatMap(section => section.questions)
