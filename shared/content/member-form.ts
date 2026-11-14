// The choices of a member's card (/famiglia/membri), behind the consent to health data (docs/spec.md, 3.8):
// «Informazioni utili» for everyone (allergies, diet, notes: the canteen reads them) and, for the young
// person with a condition, the details as multiple choices, with the food selectivity as the one text.
// A draft for the camp to confirm. Values are stored by key: a label can change, a key cannot.

export interface Choice<K extends string = string> {
  value: K
  label: string
  /** «Nessun supporto», «Nessuna terapia»: the only answer when chosen. */
  exclusive?: boolean
}

/** The labels of the fields that are not lists of choices: the form and the views read them here. */
export const HEALTH_LABELS = {
  foodSelectivity: 'Selettività alimentare',
  notes: 'Altro da sapere',
  allergies: 'Allergie e intolleranze',
  diet: 'Preferenze alimentari',
  infoNotes: 'Altre note da segnalare',
} as const

/** The 14 allergens of EU Regulation 1169/2011, lactose with milk. `canteen` is how the canteen lists them. */
export const ALLERGIES: (Choice & { canteen: string })[] = [
  { value: 'gluten', label: 'Glutine (celiachia)', canteen: 'senza glutine' },
  { value: 'milk', label: 'Latte e lattosio', canteen: 'senza lattosio' },
  { value: 'eggs', label: 'Uova', canteen: 'senza uova' },
  { value: 'fish', label: 'Pesce', canteen: 'senza pesce' },
  { value: 'crustaceans', label: 'Crostacei', canteen: 'senza crostacei' },
  { value: 'molluscs', label: 'Molluschi', canteen: 'senza molluschi' },
  { value: 'peanuts', label: 'Arachidi', canteen: 'senza arachidi' },
  { value: 'nuts', label: 'Frutta a guscio', canteen: 'senza frutta a guscio' },
  { value: 'soy', label: 'Soia', canteen: 'senza soia' },
  { value: 'celery', label: 'Sedano', canteen: 'senza sedano' },
  { value: 'mustard', label: 'Senape', canteen: 'senza senape' },
  { value: 'sesame', label: 'Sesamo', canteen: 'senza sesamo' },
  { value: 'sulphites', label: 'Solfiti', canteen: 'senza solfiti' },
  { value: 'lupin', label: 'Lupini', canteen: 'senza lupini' },
]

/** Food preferences: one at most, none means everything. */
export const DIETS: (Choice & { canteen: string })[] = [
  { value: 'vegetarian', label: 'Vegetariana', canteen: 'vegetariana' },
  { value: 'vegan', label: 'Vegana', canteen: 'vegana' },
  { value: 'no_pork', label: 'Senza carne di maiale', canteen: 'senza maiale' },
]

/** The details of a young person with a condition, each a list of choices (at least one). */
export const DISABILITY_CHOICES = [
  {
    key: 'conditions',
    label: 'Tipologia',
    options: [
      { value: 'autism', label: 'Disturbo dello spettro autistico' },
      { value: 'intellectual', label: 'Disabilità intellettiva' },
      { value: 'motor', label: 'Disabilità motoria' },
      { value: 'visual', label: 'Disabilità visiva' },
      { value: 'hearing', label: 'Disabilità uditiva' },
      { value: 'genetic', label: 'Sindrome genetica (per esempio sindrome di Down)' },
      { value: 'neurodevelopmental', label: 'Altri disturbi del neurosviluppo (ADHD, linguaggio, apprendimento)' },
      { value: 'epilepsy', label: 'Epilessia' },
      { value: 'chronic', label: 'Patologia grave o cronica (oncologica, cardiaca, metabolica, respiratoria)' },
      { value: 'other', label: 'Altro' },
    ],
  },
  {
    key: 'support',
    label: 'Ha bisogno di supporto per',
    options: [
      { value: 'eating', label: 'Mangiare' },
      { value: 'hygiene', label: 'Igiene personale' },
      { value: 'toilet', label: 'Uso del bagno o pannolino' },
      { value: 'dressing', label: 'Vestirsi' },
      { value: 'sleep', label: 'Addormentarsi e dormire' },
      { value: 'moving', label: 'Spostarsi' },
      { value: 'emotions', label: 'Gestire emozioni e cambiamenti' },
      { value: 'supervision', label: 'Sorveglianza costante' },
      { value: 'none', label: 'Nessun supporto particolare', exclusive: true },
    ],
  },
  {
    key: 'mobility',
    label: 'Mobilità e ausili',
    options: [
      { value: 'autonomous', label: 'Cammina da solo' },
      { value: 'assisted', label: 'Cammina con aiuto' },
      { value: 'walker', label: 'Deambulatore o stampelle' },
      { value: 'manual_wheelchair', label: 'Carrozzina manuale' },
      { value: 'power_wheelchair', label: 'Carrozzina elettrica' },
      { value: 'stairs', label: 'Difficoltà con le scale' },
    ],
  },
  {
    key: 'communication',
    label: 'Comunicazione',
    options: [
      { value: 'speaks', label: 'Parla' },
      { value: 'short_sentences', label: 'Frasi brevi' },
      { value: 'few_words', label: 'Poche parole' },
      { value: 'non_verbal', label: 'Non verbale' },
      { value: 'aac', label: 'CAA (comunicazione aumentativa alternativa)' },
      { value: 'lis', label: 'LIS (lingua dei segni)' },
      { value: 'gestures', label: 'Gesti e immagini' },
    ],
  },
  {
    key: 'care',
    label: 'Terapie e attenzioni',
    options: [
      { value: 'daily_meds', label: 'Farmaci durante la giornata' },
      { value: 'night_meds', label: 'Farmaci la sera o la notte' },
      { value: 'seizures', label: 'Rischio di crisi epilettiche' },
      { value: 'prescribed_diet', label: 'Dieta prescritta dal medico' },
      { value: 'devices', label: 'Dispositivi medici (per esempio PEG, sondino, ossigeno)' },
      { value: 'none', label: 'Nessuna terapia', exclusive: true },
    ],
  },
] as const satisfies readonly { key: string; label: string; options: readonly Choice[] }[]
export type DisabilityChoiceKey = (typeof DISABILITY_CHOICES)[number]['key']

/** The label of a stored choice; an unknown key (an option removed since) shows as it is. */
export function choiceLabel(options: readonly Choice[], value: string): string {
  return options.find(option => option.value === value)?.label ?? value
}
