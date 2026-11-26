// Every fixed enumeration of the gestionale. Values are stable English keys stored in the database;
// labels, icons and colours of the (Italian) interface live in ENUM_META. A colour is never the only
// signal: badges always show the icon and the label together.
//
// No imports: scripts/create-calendar.mjs loads this file with Node's type stripping
// (tests/unit/calendar.test.ts runs it).

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

/**
 * registered (account, address or CV still missing) → applied (candidatura inviata) → approved / rejected;
 * inactive = no longer called.
 */
export const STAFF_STATUSES = ['registered', 'applied', 'approved', 'rejected', 'inactive'] as const
export type StaffStatus = (typeof STAFF_STATUSES)[number]
/** Who sees the whole staff area (spec 3.4): the others see only the home with where their application stands. */
export function inStaffArea(status: StaffStatus | null | undefined): boolean {
  return status === 'approved' || status === 'inactive'
}

/**
 * A role of staff and v-team: the id of a row of `staff_roles`, which the administration creates, renames
 * and deletes (docs/spec.md 3.4). Two ids come with migration 0023 and the app knows them: the coordinator
 * (one per team in the base of a session, so it cannot be deleted) and the group lead (first among the
 * staff of an activity group).
 */
export type StaffRole = string
export const COORDINATOR_ROLE = 'coordinator'
export const GROUP_LEAD_ROLE = 'group_lead'
/** The roles the app knows cannot be deleted, only renamed: why, for the editor and the refusal. */
export const PROTECTED_ROLES = new Map<string, string>([
  [COORDINATOR_ROLE, 'Serve alla base della sessione (un coordinatore per squadra)'],
  [GROUP_LEAD_ROLE, 'Mette per primi i responsabili quando scegli chi guida un gruppo attività'],
])

/** The colours a tag of the «Valutazione» can have: the tones of the theme, always next to its name. */
export const STAFF_TAG_COLORS = ['neutral', 'info', 'success', 'warning', 'error', 'secondary'] as const
export type StaffTagColor = (typeof STAFF_TAG_COLORS)[number]

/** The two teams of the staff side: the staff and the volunteers (v-team). Each has its own coordinator. */
export const STAFF_TEAMS = ['staff', 'volunteer'] as const
export type StaffTeam = (typeof STAFF_TEAMS)[number]
/** «Aggiungi persone dello staff», «3 del v-team»: the team after a noun or a number. */
export const OF_TEAM: Record<StaffTeam, string> = { staff: 'dello staff', volunteer: 'del v-team' }
export const IN_TEAM: Record<StaffTeam, string> = { staff: 'nello staff', volunteer: 'nel v-team' }

/** Who a document went to, for the filter of the documents list: families, or one of the two teams. */
export const DOCUMENT_AUDIENCES = ['family', ...STAFF_TEAMS] as const
export type DocumentAudience = (typeof DOCUMENT_AUDIENCES)[number]

/** A convocation still in play: prepared, sent or accepted. */
export const OPEN_CONVOCATIONS: readonly ConvocationStatus[] = ['draft', 'sent', 'accepted']

/** A convocation of a staff member to a session. "Confermata" is derived: accepted + contract signed. */
export const CONVOCATION_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'cancelled'] as const
export type ConvocationStatus = (typeof CONVOCATION_STATUSES)[number]

/**
 * The relationship of a member to the young person with a condition (the camp's guest): that person's own
 * card has none (null).
 */
export const MEMBER_RELATIONSHIPS = ['parent', 'sibling', 'grandparent', 'aunt_uncle', 'guardian', 'other'] as const
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

/** The regions of Italy, for the residence of a family or of a staff member. */
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

/** The T-shirt sizes of the staff's uniform (the personal sheet, /staff/scheda). */
export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const
export type ShirtSize = (typeof SHIRT_SIZES)[number]

/** How a member of the staff works with the camp, asked in the personal sheet; not the v-team, who volunteer. */
export const STAFF_CONTRACTS = ['vat_number', 'occasional'] as const
export type StaffContract = (typeof STAFF_CONTRACTS)[number]

export const DOCUMENT_CATEGORIES = ['contract', 'consent', 'regulation', 'privacy', 'other'] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

/**
 * A document in the «Risorse utili» of staff and v-team (docs/spec.md 3.6): to read and accept (or sign, as the
 * document says), each approved person asked; or only to consult.
 */
export const STAFF_RESOURCE_MODES = ['accept', 'consult'] as const
export type StaffResourceMode = (typeof STAFF_RESOURCE_MODES)[number]

export const SIGNATURE_STATUSES = ['pending', 'signed', 'cancelled'] as const
export type SignatureStatus = (typeof SIGNATURE_STATUSES)[number]

export const PERSONAL_DOCUMENT_CATEGORIES = [
  'medical_certificate',
  'diagnosis',
  'id_document',
  'health_card',
  'certification',
  'cv',
  'other',
] as const
export type PersonalDocumentCategory = (typeof PERSONAL_DOCUMENT_CATEGORIES)[number]

/** What a stored file is for; decides who may download it (server/utils/files.ts). */
export const FILE_PURPOSES = ['personal_document', 'cv', 'document', 'signed_copy'] as const
export type FilePurpose = (typeof FILE_PURPOSES)[number]

export const EMAIL_STATUSES = ['sent', 'failed', 'simulated', 'queued', 'sending', 'withdrawn', 'disabled'] as const
export type EmailStatus = (typeof EMAIL_STATUSES)[number]

/** The most emails that may leave in one day, whatever they are: Resend's free plan, on a UTC day. */
export const EMAIL_DAILY_LIMIT = 100
/** Kept for access emails (links, codes) until 23:59, when what is left goes to the queue. */
export const EMAIL_ACCESS_RESERVE = 20
/** Ordinary emails leave up to here; over it they wait in the queue. */
export const EMAIL_ORDINARY_LIMIT = EMAIL_DAILY_LIMIT - EMAIL_ACCESS_RESERVE
/** The queue leaves between these hours, plus one last round at 23:59. */
export const EMAIL_QUEUE_START_HOUR = 8
export const EMAIL_QUEUE_END_HOUR = 20

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

/** The kinds of question of the questionnaire «Dati della famiglia» (shared/content/family-form.ts). */
export const FORM_QUESTION_TYPES = ['text', 'textarea', 'select', 'multiselect', 'boolean'] as const
export type FormQuestionType = (typeof FORM_QUESTION_TYPES)[number]

/**
 * The activity groups: the families of a session are split among them (docs/spec.md 3.12) and they rotate
 * through the activities of `groups` blocks.
 */
export const PROGRAMME_GROUPS = ['yellow', 'red', 'blue'] as const
export type ProgrammeGroup = (typeof PROGRAMME_GROUPS)[number]
export const PROGRAMME_GROUP_LABELS: Record<ProgrammeGroup, string> = {
  yellow: 'Giallo',
  red: 'Rosso',
  blue: 'Blu',
}

/**
 * What a lodging (alloggio) offers: the three needs the family data asks about
 * (shared/content/family-form.ts, ACCOMMODATION_NEED_FEATURES).
 */
export const LODGING_FEATURES = ['kitchen', 'accessible_bathroom', 'microwave'] as const
export type LodgingFeature = (typeof LODGING_FEATURES)[number]

/** Where a lodging is: the places the camp uses, in the order of the layout (docs/spec.md 3.11). */
export const LODGING_LOCATIONS = ['melina', 'nu_suennu', 'torricella', 'invictus_camp'] as const
export type LodgingLocation = (typeof LODGING_LOCATIONS)[number]

/** Who a contact of the «Anagrafica» is for the camp (docs/spec.md 3.16): with or without an account. */
export const CONTACT_KINDS = ['family', 'staff', 'volunteer', 'supporter', 'partner', 'other'] as const
export type ContactKind = (typeof CONTACT_KINDS)[number]

/** Uploads: 15 MB, PDF or images. Documents to sign are PDF only. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
export const UPLOAD_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export type UploadMimeType = (typeof UPLOAD_MIME_TYPES)[number]

/** Every date of the camp is a day in Italy. */
export const TIME_ZONE = 'Europe/Rome'
export const LOCALE = 'it-IT'

/** The ages of the young people with a condition the camp takes, both included. */
export const GUEST_AGE = { min: 5, max: 21 } as const

/** Whether the guests of a family fit the camp's ages: unknown while a birth date is missing. */
export type GuestAgeStatus = 'unknown' | 'in' | 'out'

/** Default place of a session. */
export const DEFAULT_LOCATION = 'Invictus Camp, Maruggio (TA)'
/** Default places for families of a new session. */
export const DEFAULT_FAMILY_SLOTS = 8
/** The base of a session: 10 people of the staff, plus the coordinators of the staff and of the v-team. */
export const DEFAULT_STAFF_NEEDED = 10

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

const staffContract: Record<StaffContract, EnumMeta> = {
  vat_number: { label: 'Partita IVA', icon: 'i-lucide-briefcase', color: 'neutral' },
  occasional: { label: 'Collaborazione occasionale', icon: 'i-lucide-handshake', color: 'neutral' },
}

const staffTeam: Record<StaffTeam, EnumMeta> = {
  staff: { label: 'Staff', icon: 'i-lucide-id-card', color: 'neutral' },
  volunteer: { label: 'V-team', icon: 'i-lucide-hand-heart', color: 'neutral', description: 'Volontari' },
}

/** On a convocation: whether the person said they can come to the whole session. */
const staffAvailability: Record<'available' | 'missing', EnumMeta> = {
  available: {
    label: 'Disponibile',
    icon: 'i-lucide-calendar-check',
    color: 'success',
    description: 'Disponibile per tutta la sessione',
  },
  missing: {
    label: 'Senza disponibilità',
    icon: 'i-lucide-calendar-x',
    color: 'warning',
    description: 'Non ha dato disponibilità per questa sessione, o l’ha tolta',
  },
}

const documentAudience: Record<DocumentAudience, EnumMeta> = {
  family: { label: 'Famiglie', icon: 'i-lucide-house-heart', color: 'neutral' },
  staff: { label: 'Staff', icon: 'i-lucide-id-card', color: 'neutral' },
  volunteer: { label: 'V-team', icon: 'i-lucide-hand-heart', color: 'neutral' },
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
  sibling: { label: 'Fratello/Sorella', icon: 'i-lucide-users', color: 'neutral' },
  grandparent: { label: 'Nonno/Nonna', icon: 'i-lucide-user-round', color: 'neutral' },
  aunt_uncle: { label: 'Zio/Zia', icon: 'i-lucide-user-round', color: 'neutral' },
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
  cv: { label: 'Curriculum', icon: 'i-lucide-file-user', color: 'neutral' },
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
  queued: {
    label: 'In coda',
    icon: 'i-lucide-clock',
    color: 'warning',
    description: 'Aspetta il primo posto libero nel limite giornaliero',
  },
  sending: { label: 'In invio', icon: 'i-lucide-loader', color: 'info' },
  withdrawn: {
    label: 'Ritirata',
    icon: 'i-lucide-undo-2',
    color: 'neutral',
    description: 'Tolta dalla coda prima di partire',
  },
  disabled: {
    label: 'Spenta',
    icon: 'i-lucide-power-off',
    color: 'neutral',
    description: 'Non inviata: l’email automatica è spenta',
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

const formQuestionType: Record<FormQuestionType, EnumMeta> = {
  text: { label: 'Testo breve', icon: 'i-lucide-text-cursor-input', color: 'neutral', description: 'Una riga.' },
  textarea: { label: 'Testo lungo', icon: 'i-lucide-text', color: 'neutral', description: 'Più righe.' },
  select: {
    label: 'Scelta singola',
    icon: 'i-lucide-circle-dot',
    color: 'neutral',
    description: 'Una sola opzione tra quelle che scrivi.',
  },
  multiselect: {
    label: 'Scelta multipla',
    icon: 'i-lucide-list-checks',
    color: 'neutral',
    description: 'Una o più opzioni tra quelle che scrivi.',
  },
  boolean: { label: 'Sì o no', icon: 'i-lucide-toggle-left', color: 'neutral', description: 'Due risposte: Sì, No.' },
}

const lodgingLocation: Record<LodgingLocation, EnumMeta> = {
  melina: { label: 'B&B Melina', icon: 'i-lucide-map-pin', color: 'neutral' },
  nu_suennu: { label: 'B&B Nu Suennu', icon: 'i-lucide-map-pin', color: 'neutral' },
  torricella: { label: 'Appartamenti Torricella', icon: 'i-lucide-map-pin', color: 'neutral' },
  invictus_camp: { label: 'Alloggi Invictus Camp', icon: 'i-lucide-map-pin', color: 'neutral' },
}

const contactKind: Record<ContactKind, EnumMeta> = {
  family: { label: 'Famiglia', icon: 'i-lucide-heart-handshake', color: 'secondary' },
  staff: { label: 'Staff', icon: 'i-lucide-id-card', color: 'info' },
  volunteer: { label: 'V-team', icon: 'i-lucide-hand-heart', color: 'success', description: 'Volontari' },
  supporter: {
    label: 'Sostenitore',
    icon: 'i-lucide-gift',
    color: 'warning',
    description: 'Donatori e amici del camp',
  },
  partner: {
    label: 'Ente o partner',
    icon: 'i-lucide-building-2',
    color: 'primary',
    description: 'Scuole, associazioni, aziende',
  },
  other: { label: 'Altro', icon: 'i-lucide-user', color: 'neutral' },
}

const staffTagColor: Record<StaffTagColor, EnumMeta> = {
  neutral: { label: 'Sabbia', icon: 'i-lucide-circle', color: 'neutral' },
  info: { label: 'Azzurro', icon: 'i-lucide-circle', color: 'info' },
  success: { label: 'Verde', icon: 'i-lucide-circle', color: 'success' },
  warning: { label: 'Giallo', icon: 'i-lucide-circle', color: 'warning' },
  error: { label: 'Rosso', icon: 'i-lucide-circle', color: 'error' },
  secondary: { label: 'Viola', icon: 'i-lucide-circle', color: 'secondary' },
}

const lodgingFeature: Record<LodgingFeature, EnumMeta> = {
  kitchen: { label: 'Cucina', icon: 'i-lucide-cooking-pot', color: 'neutral' },
  accessible_bathroom: { label: 'Bagno senza barriere', icon: 'i-lucide-accessibility', color: 'neutral' },
  microwave: { label: 'Microonde', icon: 'i-lucide-microwave', color: 'neutral' },
}

export const ENUM_META = {
  programmeBlockKind,
  formQuestionType,
  userRole,
  userStatus,
  sessionStatus,
  participationKind,
  participationStatus,
  staffStatus,
  staffTeam,
  staffContract,
  staffTagColor,
  staffAvailability,
  convocationStatus,
  memberRelationship,
  memberKind,
  familyFormStatus,
  documentCategory,
  signatureStatus,
  documentAudience,
  personalDocumentCategory,
  emailStatus,
  lodgingFeature,
  lodgingLocation,
  contactKind,
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
