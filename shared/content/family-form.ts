// The family questionnaire. SPRINT 1 PLACEHOLDER: generic questions to build and test the flow; the
// real questions and their conditions arrive in sprint 2. Keep the shape: answers are stored in
// families.form_answers keyed by question id (shared/types/domain.ts, FormAnswers).

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

export const FAMILY_FORM_VERSION = 'placeholder-1'

export const FAMILY_FORM_SECTIONS: FormSection[] = [
  {
    id: 'general',
    title: 'La vostra famiglia',
    description: 'Domande provvisorie: il questionario completo arriverà nelle prossime settimane.',
    questions: [
      {
        id: 'howDidYouHear',
        label: 'Come avete conosciuto Invictus Camp?',
        type: 'select',
        options: ['Passaparola', 'Social network', 'Associazione o ente', 'Struttura sanitaria', 'Altro'],
        required: true,
      },
      { id: 'previousCamps', label: 'Avete già partecipato a un camp?', type: 'boolean' },
    ],
  },
  {
    id: 'needs',
    title: 'Esigenze per il soggiorno',
    questions: [
      {
        id: 'accommodationNeeds',
        label: 'Esigenze per l’alloggio',
        type: 'textarea',
        help: 'Per esempio accessibilità, letti, ausili da portare.',
      },
      {
        id: 'dietaryNeeds',
        label: 'Abitudini e preferenze alimentari',
        type: 'textarea',
        // Allergies and medical diets are health data: they belong to each member's reserved section,
        // which needs the explicit consent (docs/spec.md 3.8).
        help: 'Allergie, intolleranze e diete mediche vanno nelle informazioni sanitarie di ciascun componente.',
      },
      {
        id: 'preferredPeriods',
        label: 'Periodi preferiti',
        type: 'multiselect',
        options: ['Giugno', 'Luglio', 'Agosto', 'Settembre'],
        required: true,
      },
    ],
  },
  {
    id: 'expectations',
    title: 'Aspettative',
    questions: [{ id: 'expectations', label: 'Cosa vi aspettate dall’esperienza al camp?', type: 'textarea' }],
  },
]

export const FAMILY_FORM_QUESTIONS: FormQuestion[] = FAMILY_FORM_SECTIONS.flatMap(section => section.questions)
