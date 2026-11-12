// Every fixed enumeration of the gestionale. Values are stable English keys stored in the database;
// labels, icons and colours of the (Italian) interface live in ENUM_META. A colour is never the only
// signal: badges always show the icon and the label together.

export const USER_ROLES = ['admin', 'family', 'staff'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const USER_STATUSES = ['invited', 'active', 'disabled'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const TOKEN_PURPOSES = ['invite', 'verify_email', 'reset_password'] as const
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number]

/** Life of a camp session. Leaving `draft` sends the invitations to the families (docs/spec.md, 3.1). */
export const SESSION_STATUSES = ['draft', 'inviting', 'confirmed', 'completed', 'cancelled'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

/** A family in a session holds one of the slots (titolare) or waits on the ordered reserve list. */
export const PARTICIPATION_KINDS = ['slot', 'reserve'] as const
export type ParticipationKind = (typeof PARTICIPATION_KINDS)[number]

export const PARTICIPATION_STATUSES = ['selected', 'invited', 'confirmed', 'declined', 'cancelled'] as const
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number]

/** registered (account only) → applied (candidatura inviata) → approved / rejected; inactive = no longer called. */
export const STAFF_STATUSES = ['registered', 'applied', 'approved', 'rejected', 'inactive'] as const
export type StaffStatus = (typeof STAFF_STATUSES)[number]

export const STAFF_ROLES = ['group_lead', 'activity_lead', 'other'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

/** A convocation of a staff member to a session. "Confermata" is derived: accepted + contract signed. */
export const CONVOCATION_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'cancelled'] as const
export type ConvocationStatus = (typeof CONVOCATION_STATUSES)[number]

export const MEMBER_RELATIONSHIPS = ['parent', 'child', 'sibling', 'grandparent', 'guardian', 'other'] as const
export type MemberRelationship = (typeof MEMBER_RELATIONSHIPS)[number]

/**
 * Who a member is in the family's data: an adult or a young person (ragazzo o ragazza). Whether the young
 * person has a condition is `hasDisability`, health data (docs/spec.md, 3.8).
 */
export const MEMBER_KINDS = ['adult', 'young'] as const
export type MemberKind = (typeof MEMBER_KINDS)[number]

/** `draft`: the family data is not confirmed yet; `submitted`: confirmed, the members' cards exist. */
export const FAMILY_FORM_STATUSES = ['draft', 'submitted'] as const
export type FamilyFormStatus = (typeof FAMILY_FORM_STATUSES)[number]

/** The regions of Italy, for the family's residence. */
export const ITALIAN_REGIONS = [
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  'Umbria',
  'Valle d’Aosta',
  'Veneto',
] as const
export type ItalianRegion = (typeof ITALIAN_REGIONS)[number]

export const DOCUMENT_CATEGORIES = ['contract', 'consent', 'regulation', 'privacy', 'other'] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export const SIGNATURE_STATUSES = ['pending', 'signed', 'cancelled'] as const
export type SignatureStatus = (typeof SIGNATURE_STATUSES)[number]

export const PERSONAL_DOCUMENT_CATEGORIES = [
  'medical_certificate',
  'diagnosis',
  'id_document',
  'health_card',
  'certification',
  'other',
] as const
export type PersonalDocumentCategory = (typeof PERSONAL_DOCUMENT_CATEGORIES)[number]

/** What a stored file is for; decides who may download it (server/utils/files.ts). */
export const FILE_PURPOSES = ['personal_document', 'cv', 'document', 'signed_copy'] as const
export type FilePurpose = (typeof FILE_PURPOSES)[number]

export const EMAIL_STATUSES = ['sent', 'failed', 'simulated'] as const
export type EmailStatus = (typeof EMAIL_STATUSES)[number]

/** What a block of the week programme is (docs/spec.md 3.10). `staff` blocks are not shown to families. */
export const PROGRAMME_BLOCK_KINDS = [
  'groups',
  'everyone',
  'adults',
  'choice',
  'welcome',
  'meal',
  'rest',
  'free',
  'staff',
  'departure',
] as const
export type ProgrammeBlockKind = (typeof PROGRAMME_BLOCK_KINDS)[number]

/** The groups that rotate through the activities of `groups` blocks. */
export const PROGRAMME_GROUPS = ['yellow', 'red', 'blue'] as const
export type ProgrammeGroup = (typeof PROGRAMME_GROUPS)[number]
export const PROGRAMME_GROUP_LABELS: Record<ProgrammeGroup, string> = {
  yellow: 'Giallo',
  red: 'Rosso',
  blue: 'Blu',
}

/** Uploads: 15 MB, PDF or images. Documents to sign are PDF only. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
export const UPLOAD_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export type UploadMimeType = (typeof UPLOAD_MIME_TYPES)[number]

/** Every date of the camp is a day in Italy. */
export const TIME_ZONE = 'Europe/Rome'
export const LOCALE = 'it-IT'

/** Default place of a session. */
export const DEFAULT_LOCATION = 'Invictus Camp, Maruggio (TA)'

export type Tone = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

export interface EnumMeta {
  label: string
  icon: string
  color: Tone
  /** One sentence shown where the value is chosen or explained. */
  description?: string
}

const userRole: Record<UserRole, EnumMeta> = {
  admin: { label: 'Amministrazione', icon: 'i-lucide-shield-check', color: 'primary' },
  family: { label: 'Famiglia', icon: 'i-lucide-heart-handshake', color: 'secondary' },
  staff: { label: 'Staff', icon: 'i-lucide-id-card', color: 'info' },
}

const userStatus: Record<UserStatus, EnumMeta> = {
  invited: { label: 'Invitato', icon: 'i-lucide-mail', color: 'info', description: 'Non ha ancora scelto la password' },
  active: { label: 'Attivo', icon: 'i-lucide-circle-check', color: 'success' },
  disabled: { label: 'Disattivato', icon: 'i-lucide-ban', color: 'neutral', description: 'Non può accedere' },
}

const sessionStatus: Record<SessionStatus, EnumMeta> = {
  draft: {
    label: 'Bozza',
    icon: 'i-lucide-pencil-line',
    color: 'neutral',
    description: 'In preparazione: le famiglie non ricevono ancora nulla',
  },
  inviting: {
    label: 'Inviti aperti',
    icon: 'i-lucide-send',
    color: 'info',
    description: 'Le famiglie titolari sono invitate e possono confermare o rinunciare',
  },
  confirmed: {
    label: 'Confermata',
    icon: 'i-lucide-circle-check',
    color: 'success',
    description: 'Partecipanti confermati, la sessione si farà',
  },
  completed: { label: 'Conclusa', icon: 'i-lucide-flag', color: 'secondary', description: 'Nello storico' },
  cancelled: { label: 'Annullata', icon: 'i-lucide-circle-x', color: 'error', description: 'Non si farà' },
}

const participationKind: Record<ParticipationKind, EnumMeta> = {
  slot: { label: 'Titolare', icon: 'i-lucide-user-check', color: 'primary', description: 'Occupa uno dei posti' },
  reserve: {
    label: 'Riserva',
    icon: 'i-lucide-list-ordered',
    color: 'neutral',
    description: 'Viene chiamata, in ordine, quando si libera un posto',
  },
}

const participationStatus: Record<ParticipationStatus, EnumMeta> = {
  selected: {
    label: 'Selezionata',
    icon: 'i-lucide-circle-dashed',
    color: 'neutral',
    description: 'Riceverà l’invito quando la sessione apre gli inviti',
  },
  invited: { label: 'Invitata', icon: 'i-lucide-mail', color: 'info', description: 'In attesa di risposta' },
  confirmed: { label: 'Confermata', icon: 'i-lucide-circle-check', color: 'success' },
  declined: { label: 'Rinuncia', icon: 'i-lucide-undo-2', color: 'warning', description: 'Ha liberato il posto' },
  cancelled: { label: 'Annullata', icon: 'i-lucide-ban', color: 'error' },
}

const staffStatus: Record<StaffStatus, EnumMeta> = {
  registered: {
    label: 'Registrato',
    icon: 'i-lucide-user',
    color: 'neutral',
    description: 'Ha creato l’account ma non ha ancora inviato la candidatura',
  },
  applied: { label: 'Candidatura inviata', icon: 'i-lucide-inbox', color: 'info', description: 'Da valutare' },
  approved: {
    label: 'Staff approvato',
    icon: 'i-lucide-badge-check',
    color: 'success',
    description: 'Può dare disponibilità ed essere convocato',
  },
  rejected: { label: 'Non selezionato', icon: 'i-lucide-circle-x', color: 'error' },
  inactive: { label: 'Non attivo', icon: 'i-lucide-pause', color: 'neutral', description: 'Non viene più convocato' },
}

const staffRole: Record<StaffRole, EnumMeta> = {
  group_lead: { label: 'Responsabile di gruppo', icon: 'i-lucide-users', color: 'neutral' },
  activity_lead: { label: 'Responsabile attività', icon: 'i-lucide-shapes', color: 'neutral' },
  other: { label: 'Altro', icon: 'i-lucide-user', color: 'neutral' },
}

const convocationStatus: Record<ConvocationStatus, EnumMeta> = {
  draft: {
    label: 'Da inviare',
    icon: 'i-lucide-pencil-line',
    color: 'neutral',
    description: 'Scelto per la sessione, convocazione non ancora inviata',
  },
  sent: { label: 'Inviata', icon: 'i-lucide-send', color: 'info', description: 'In attesa di risposta' },
  accepted: { label: 'Accettata', icon: 'i-lucide-thumbs-up', color: 'success' },
  declined: { label: 'Rifiutata', icon: 'i-lucide-thumbs-down', color: 'warning' },
  cancelled: { label: 'Annullata', icon: 'i-lucide-ban', color: 'error' },
}

const memberRelationship: Record<MemberRelationship, EnumMeta> = {
  parent: { label: 'Genitore', icon: 'i-lucide-user', color: 'neutral' },
  child: { label: 'Figlio/Figlia', icon: 'i-lucide-smile', color: 'neutral' },
  sibling: { label: 'Fratello/Sorella', icon: 'i-lucide-users', color: 'neutral' },
  grandparent: { label: 'Nonno/Nonna', icon: 'i-lucide-user-round', color: 'neutral' },
  guardian: { label: 'Tutore/Tutrice', icon: 'i-lucide-shield', color: 'neutral' },
  other: { label: 'Altro', icon: 'i-lucide-user', color: 'neutral' },
}

const memberKind: Record<MemberKind, EnumMeta> = {
  adult: { label: 'Adulto', icon: 'i-lucide-user', color: 'neutral' },
  young: { label: 'Ragazzo o ragazza', icon: 'i-lucide-smile', color: 'neutral' },
}

const familyFormStatus: Record<FamilyFormStatus, EnumMeta> = {
  draft: { label: 'Da completare', icon: 'i-lucide-file-pen-line', color: 'warning' },
  submitted: { label: 'Confermati', icon: 'i-lucide-file-check', color: 'success' },
}

const documentCategory: Record<DocumentCategory, EnumMeta> = {
  contract: { label: 'Contratto', icon: 'i-lucide-signature', color: 'neutral' },
  consent: { label: 'Consenso', icon: 'i-lucide-square-check', color: 'neutral' },
  regulation: { label: 'Regolamento', icon: 'i-lucide-book-open', color: 'neutral' },
  privacy: { label: 'Informativa privacy', icon: 'i-lucide-lock', color: 'neutral' },
  other: { label: 'Altro', icon: 'i-lucide-file', color: 'neutral' },
}

const signatureStatus: Record<SignatureStatus, EnumMeta> = {
  pending: { label: 'Da firmare', icon: 'i-lucide-pen-line', color: 'warning' },
  signed: { label: 'Firmato', icon: 'i-lucide-file-check', color: 'success' },
  cancelled: { label: 'Annullato', icon: 'i-lucide-ban', color: 'neutral' },
}

const personalDocumentCategory: Record<PersonalDocumentCategory, EnumMeta> = {
  medical_certificate: { label: 'Certificato medico', icon: 'i-lucide-stethoscope', color: 'neutral' },
  diagnosis: { label: 'Diagnosi o relazione clinica', icon: 'i-lucide-clipboard-list', color: 'neutral' },
  id_document: { label: 'Documento d’identità', icon: 'i-lucide-id-card', color: 'neutral' },
  health_card: { label: 'Tessera sanitaria', icon: 'i-lucide-credit-card', color: 'neutral' },
  certification: { label: 'Attestato o titolo', icon: 'i-lucide-award', color: 'neutral' },
  other: { label: 'Altro', icon: 'i-lucide-file', color: 'neutral' },
}

const emailStatus: Record<EmailStatus, EnumMeta> = {
  sent: { label: 'Inviata', icon: 'i-lucide-send', color: 'success' },
  failed: { label: 'Non recapitata', icon: 'i-lucide-triangle-alert', color: 'error' },
  simulated: {
    label: 'Simulata',
    icon: 'i-lucide-flask-conical',
    color: 'neutral',
    description: 'Non inviata: manca la chiave di Resend (sviluppo)',
  },
}

const programmeBlockKind: Record<ProgrammeBlockKind, EnumMeta> = {
  groups: { label: 'Attività a gruppi', icon: 'i-lucide-shapes', color: 'primary' },
  everyone: { label: 'Tutti insieme', icon: 'i-lucide-party-popper', color: 'secondary' },
  adults: { label: 'Solo adulti', icon: 'i-lucide-coffee', color: 'info' },
  choice: { label: 'A scelta', icon: 'i-lucide-sparkles', color: 'info' },
  welcome: { label: 'Accoglienza', icon: 'i-lucide-hand-heart', color: 'neutral' },
  meal: { label: 'Pasto', icon: 'i-lucide-utensils', color: 'neutral' },
  rest: { label: 'Riposo', icon: 'i-lucide-moon', color: 'neutral' },
  free: { label: 'Libero', icon: 'i-lucide-sun', color: 'neutral' },
  staff: {
    label: 'Solo staff',
    icon: 'i-lucide-id-card',
    color: 'neutral',
    description: 'Le famiglie non vedono questo blocco',
  },
  departure: { label: 'Partenza', icon: 'i-lucide-car-front', color: 'neutral' },
}

export const ENUM_META = {
  programmeBlockKind,
  userRole,
  userStatus,
  sessionStatus,
  participationKind,
  participationStatus,
  staffStatus,
  staffRole,
  convocationStatus,
  memberRelationship,
  memberKind,
  familyFormStatus,
  documentCategory,
  signatureStatus,
  personalDocumentCategory,
  emailStatus,
} as const

export type EnumName = keyof typeof ENUM_META
export type EnumValue<N extends EnumName> = keyof (typeof ENUM_META)[N] & string

/** Meta of one value; unknown values fall back to a neutral badge with the raw key. */
export function enumMeta<N extends EnumName>(name: N, value: string): EnumMeta {
  const table = ENUM_META[name] as Record<string, EnumMeta>
  return table[value] ?? { label: value, icon: 'i-lucide-circle-help', color: 'neutral' }
}

export function enumLabel<N extends EnumName>(name: N, value: string): string {
  return enumMeta(name, value).label
}

/** The answers of a yes or no question, for a radio group bound to a boolean. */
export const YES_NO_ITEMS = [
  { label: 'Sì', value: true },
  { label: 'No', value: false },
]
