// The end-of-session questionnaire of the families (docs/spec.md 3.13), the same questions as 2026 so
// that the years compare. The activities to vote come from the programme of the session (its copy, fixed
// when the session closes); the other votes and the written questions are these. Answers are stored in
// feedback_responses: votes by label, written answers by id. Keep the ids stable, and remember that
// renaming a label leaves the old votes under the old name.

/** The votes after the activities: reception, spaces, staff. Labels as the 2026 pages had them. */
export const FEEDBACK_OTHER_ITEMS: readonly string[] = [
  'Informazioni ricevute prima dell’arrivo',
  'Accoglienza del primo giorno',
  'Stanza sensoriale',
  'Staff',
  'V-Team (volontari)',
]

export interface FeedbackQuestion {
  id: string
  /** How the administration reads it (the 2026 categories). */
  title: string
  /** How the family reads it. */
  prompt: string
}

export const FEEDBACK_QUESTIONS: readonly FeedbackQuestion[] = [
  { id: 'suggestions', title: 'Suggerimenti e feedback', prompt: 'Cosa possiamo migliorare?' },
  {
    id: 'information',
    title: 'Informazioni: cosa avresti voluto sapere',
    prompt: 'C’è qualcosa che avresti voluto sapere prima di arrivare?',
  },
  { id: 'extraActivities', title: 'Attività extra', prompt: 'Quali attività ti piacerebbe trovare al camp?' },
  { id: 'meaning', title: 'Che cos’è Invictus Camp per te', prompt: 'Che cos’è Invictus Camp per te?' },
  {
    id: 'message',
    title: 'Messaggio a staff e volontari',
    prompt: 'Vuoi lasciare un messaggio allo staff e ai volontari?',
  },
  { id: 'final', title: 'Commenti finali', prompt: 'Vuoi aggiungere qualcos’altro?' },
]
