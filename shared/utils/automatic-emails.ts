// The emails the platform sends by itself (Comunicazioni › Automatiche): what makes each one leave, who
// receives it, the fields it fills and its starting texts. The administration can change the texts and
// switch an email off; server/emails/automatic.ts renders them, deliver() honours the switch.
// Copy rules (DESIGN.md, Voice): plain Italian, short sentences, the "tu" form, no em dashes.
import { GUEST_AGE, type ParticipationKind, type ParticipationStatus } from './constants'
import { FIELD, textFields } from './plain-text'

export const AUTOMATIC_EMAIL_AREAS = ['sessions', 'staff', 'documents', 'families', 'access'] as const
export type AutomaticEmailArea = (typeof AUTOMATIC_EMAIL_AREAS)[number]

export const AUTOMATIC_EMAIL_AREA_LABELS: Record<AutomaticEmailArea, string> = {
  sessions: 'Sessioni',
  staff: 'Staff',
  documents: 'Documenti e firme',
  families: 'Famiglie',
  access: 'Accesso al gestionale',
}

/** The fields an email fills by itself for each recipient. */
export const EMAIL_FIELDS = ['nome', 'sessione', 'date', 'luogo', 'documento'] as const
export type EmailField = (typeof EMAIL_FIELDS)[number]
export type EmailFieldValues = Partial<Record<EmailField, string>>

/** The parts of an email the administration writes. Empty optional parts are left out of the email. */
export interface EmailTexts {
  subject: string
  /** The line mail clients show next to the subject. */
  preheader: string
  title: string
  /** "Ciao {nome}," */
  greeting: string
  /** Plain text: blank lines separate paragraphs, a single line break stays one. */
  body: string
  /** The button's label; the button's address is fixed. Empty for an email without a button. */
  actionLabel: string
  /** Paragraphs after the button. */
  after: string
  /** Small print under the card. */
  footnote: string
}

export const EMAIL_TEXT_LIMITS: Record<keyof EmailTexts, number> = {
  subject: 200,
  preheader: 200,
  title: 200,
  greeting: 200,
  // As the outcome a candidate receives (staffOutcomeSchema): its body is the text proposed there.
  body: 5000,
  actionLabel: 60,
  after: 4000,
  footnote: 1000,
}

export interface AutomaticEmailDefinition {
  area: AutomaticEmailArea
  label: string
  /** Who receives it. */
  recipient: string
  /** What makes it leave, in the dashboard's words. */
  trigger: string
  fields: readonly EmailField[]
  /** Why it cannot be switched off (an access link, a code, a message the administration sends itself). */
  alwaysOn?: string
  /** It can be sent by hand to the families of a session; the choice starts from these kinds and statuses. */
  manual?: { kinds: ParticipationKind[]; statuses: ParticipationStatus[] }
  defaults: EmailTexts
}

const SESSION_FIELDS = ['nome', 'sessione', 'date', 'luogo'] as const
const DOCUMENT_FIELDS = ['nome', 'documento'] as const
const NAME_ONLY = ['nome'] as const
// Who an email sent by hand starts from: the families the event would have reached.
const TOLD = { kinds: ['slot'], statuses: ['invited'] } satisfies AutomaticEmailDefinition['manual']
const RESERVES = { kinds: ['reserve'], statuses: ['invited'] } satisfies AutomaticEmailDefinition['manual']
const CONFIRMED = { kinds: ['slot'], statuses: ['confirmed'] } satisfies AutomaticEmailDefinition['manual']
const STILL_IN = {
  kinds: ['slot', 'reserve'],
  statuses: ['invited', 'confirmed'],
} satisfies AutomaticEmailDefinition['manual']
const REMOVED = { kinds: ['slot'], statuses: ['cancelled'] } satisfies AutomaticEmailDefinition['manual']
const RESERVES_REMOVED = { kinds: ['reserve'], statuses: ['cancelled'] } satisfies AutomaticEmailDefinition['manual']
const ACCESS_LINK = 'Contiene un link personale per entrare: senza, nessuno potrebbe accedere.'
const SENT_BY_HAND =
  'La mandi tu con «Comunica l’esito» nella scheda della persona, dove puoi ancora cambiare il testo.'

/** Paragraphs as the body stores them. */
const paragraphs = (...parts: string[]) => parts.join('\n\n')

function texts(input: Partial<EmailTexts> & Pick<EmailTexts, 'subject' | 'preheader' | 'title' | 'body'>): EmailTexts {
  return { greeting: 'Ciao {nome},', actionLabel: '', after: '', footnote: '', ...input }
}

function invite(intro: string): EmailTexts {
  return texts({
    subject: 'Il tuo accesso al gestionale di Invictus Camp',
    preheader: 'Scegli la tua password per entrare nel gestionale.',
    title: 'Il tuo accesso al gestionale',
    body: paragraphs(intro, 'Per entrare scegli la tua password. Il link vale 7 giorni.'),
    actionLabel: 'Scegli la password',
    footnote: 'Se non aspettavi questo invito, puoi ignorare questa email.',
  })
}

const INVITE_TRIGGER =
  'Quando crei l’account dalla pagina Utenti o premi «Invia di nuovo l’invito». Parte anche quando chi non ha ancora scelto la password chiede di reimpostarla.'

const SESSION_INVITE_BODY = paragraphs(
  'la tua famiglia è invitata a partecipare a «{sessione}» di Invictus Camp.',
  'Conferma la partecipazione o rinuncia dal gestionale. Se rinunci, il posto passa a un’altra famiglia in attesa.',
)
const SIGN_BODY = paragraphs(
  'ti chiediamo di leggere e firmare il documento «{documento}».',
  'La firma si fa nel gestionale: ti invieremo via email un codice per confermarla.',
)
const READ_BODY = paragraphs(
  'ti chiediamo di leggere il documento «{documento}».',
  'Quando lo hai letto, confermalo nel gestionale: basta un clic.',
)
const REMOVED_AFTER = 'Se pensi che sia un errore o vuoi saperne di più, contattaci.'
const NOTHING_TO_DO = 'Non devi fare nulla. Se hai domande, scrivici.'

export const AUTOMATIC_EMAILS = {
  // ─── Sessions ──────────────────────────────────────────────────────────────────────────────────
  'session.invite': {
    area: 'sessions',
    label: 'Invito alla sessione',
    recipient: 'Le famiglie titolari',
    trigger:
      'Quando apri gli inviti di una sessione, e quando aggiungi una famiglia titolare a una sessione con gli inviti aperti.',
    fields: SESSION_FIELDS,
    manual: TOLD,
    defaults: texts({
      subject: 'Invito: {sessione}',
      preheader: 'La tua famiglia è invitata a «{sessione}». Conferma o rinuncia dal gestionale.',
      title: 'La tua famiglia è invitata al camp',
      body: SESSION_INVITE_BODY,
      actionLabel: 'Rispondi all’invito',
    }),
  },
  'session.invite_reminder': {
    area: 'sessions',
    label: 'Promemoria dell’invito',
    recipient: 'La famiglia titolare che non ha ancora risposto',
    trigger: 'Quando mandi di nuovo l’invito a una famiglia che non ha ancora risposto.',
    fields: SESSION_FIELDS,
    manual: TOLD,
    defaults: texts({
      subject: 'Promemoria invito: {sessione}',
      preheader: 'La tua famiglia è invitata a «{sessione}». Conferma o rinuncia dal gestionale.',
      title: 'Promemoria: rispondi all’invito',
      body: SESSION_INVITE_BODY,
      actionLabel: 'Rispondi all’invito',
    }),
  },
  'session.reserve': {
    area: 'sessions',
    label: 'Lista di riserva',
    recipient: 'Le famiglie di riserva',
    trigger:
      'Quando apri gli inviti di una sessione, e quando aggiungi una riserva a una sessione con gli inviti aperti.',
    fields: SESSION_FIELDS,
    manual: RESERVES,
    defaults: texts({
      subject: 'Lista di riserva: {sessione}',
      preheader: 'La tua famiglia è in lista di riserva per «{sessione}».',
      title: 'La tua famiglia è in lista di riserva',
      body: paragraphs(
        'i posti di «{sessione}» sono tutti assegnati e la tua famiglia è in lista di riserva.',
        'Se si libera un posto ti scriviamo subito e potrai confermare dal gestionale. Per ora non devi fare nulla.',
      ),
      actionLabel: 'Vedi le tue sessioni',
    }),
  },
  'session.slot_offered': {
    area: 'sessions',
    label: 'Posto liberato',
    recipient: 'La famiglia di riserva chiamata',
    trigger: 'Quando chiami una famiglia di riserva a un posto libero.',
    fields: SESSION_FIELDS,
    manual: TOLD,
    defaults: texts({
      subject: 'Si è liberato un posto: {sessione}',
      preheader: 'C’è un posto per la tua famiglia in «{sessione}». Conferma o rinuncia dal gestionale.',
      title: 'Si è liberato un posto per la tua famiglia',
      body: paragraphs(
        'si è liberato un posto in «{sessione}» e la tua famiglia, che era in lista di riserva, può partecipare.',
        'Conferma la partecipazione o rinuncia dal gestionale. Se rinunci, il posto passa alla prossima famiglia in attesa.',
      ),
      actionLabel: 'Rispondi all’invito',
    }),
  },
  'session.confirmed': {
    area: 'sessions',
    label: 'Sessione confermata',
    recipient: 'Le famiglie titolari che hanno confermato',
    trigger: 'Quando confermi la sessione.',
    fields: SESSION_FIELDS,
    manual: CONFIRMED,
    defaults: texts({
      subject: 'Sessione confermata: {sessione}',
      preheader: '«{sessione}» si farà: ti aspettiamo al camp.',
      title: 'La sessione è confermata',
      body: paragraphs(
        '«{sessione}» è confermata: la tua famiglia è tra i partecipanti e ti aspettiamo al camp.',
        'Nel gestionale trovi i dettagli della sessione e i documenti da firmare, se ce ne sono.',
      ),
      actionLabel: 'Apri le tue sessioni',
    }),
  },
  'session.cancelled': {
    area: 'sessions',
    label: 'Sessione annullata',
    recipient: 'Le famiglie invitate o che avevano confermato',
    trigger: 'Quando annulli la sessione.',
    fields: SESSION_FIELDS,
    manual: STILL_IN,
    defaults: texts({
      subject: 'Sessione annullata: {sessione}',
      preheader: '«{sessione}» è stata annullata.',
      title: 'La sessione è stata annullata',
      body: paragraphs(
        'ci dispiace: «{sessione}» è stata annullata e non si terrà.',
        'Per qualsiasi domanda contattaci. Ti scriveremo quando ci saranno nuove sessioni.',
      ),
    }),
  },
  'session.removed': {
    area: 'sessions',
    label: 'Partecipazione annullata',
    recipient: 'La famiglia titolare tolta dalla sessione',
    trigger: 'Quando togli dalla sessione una famiglia titolare che aveva già ricevuto l’invito.',
    fields: SESSION_FIELDS,
    manual: REMOVED,
    defaults: texts({
      subject: 'Partecipazione annullata: {sessione}',
      preheader: 'Un aggiornamento sulla tua partecipazione a «{sessione}».',
      title: 'Un aggiornamento sulla tua partecipazione',
      body: paragraphs('la partecipazione della tua famiglia a «{sessione}» è stata annullata.', REMOVED_AFTER),
    }),
  },
  'session.reserve_removed': {
    area: 'sessions',
    label: 'Tolta dalla lista di riserva',
    recipient: 'La famiglia di riserva tolta dalla sessione',
    trigger: 'Quando togli dalla lista di riserva una famiglia che era già stata avvisata.',
    fields: SESSION_FIELDS,
    manual: RESERVES_REMOVED,
    defaults: texts({
      subject: 'Partecipazione annullata: {sessione}',
      preheader: 'Un aggiornamento sulla tua partecipazione a «{sessione}».',
      title: 'Un aggiornamento sulla tua partecipazione',
      body: paragraphs('la tua famiglia non è più nella lista di riserva di «{sessione}».', REMOVED_AFTER),
    }),
  },
  'session.feedback': {
    area: 'sessions',
    label: 'Questionario di fine sessione',
    recipient: 'Le famiglie titolari che hanno partecipato',
    trigger: 'Quando segni la sessione come conclusa, se qualcuno ha partecipato.',
    fields: SESSION_FIELDS,
    manual: CONFIRMED,
    defaults: texts({
      subject: 'Com’è andata? {sessione}',
      preheader: 'Raccontaci com’è andata «{sessione}»: bastano pochi minuti.',
      title: 'Com’è andata al camp?',
      body: paragraphs(
        'grazie per aver partecipato a «{sessione}».',
        'Ci aiuti a preparare le prossime sessioni? Dai un voto alle attività e, se vuoi, scrivici cosa ti è piaciuto e cosa cambieresti. Bastano pochi minuti e le risposte ci arrivano senza il nome della tua famiglia.',
      ),
      actionLabel: 'Rispondi al questionario',
    }),
  },

  // ─── Families ──────────────────────────────────────────────────────────────────────────────────
  'family.age_notice': {
    area: 'families',
    label: 'Fascia d’età dei ragazzi',
    recipient: 'La famiglia',
    trigger: `Quando una famiglia completa i suoi dati e nessuno dei ragazzi per cui chiede di partecipare ha tra i ${GUEST_AGE.min} e i ${GUEST_AGE.max} anni. Parte una volta sola.`,
    fields: NAME_ONLY,
    defaults: texts({
      subject: 'Sull’età dei ragazzi che accogliamo',
      preheader: `Il camp accoglie ragazzi e ragazze tra i ${GUEST_AGE.min} e i ${GUEST_AGE.max} anni.`,
      title: 'Sull’età dei ragazzi che accogliamo',
      body: paragraphs(
        'grazie per aver completato i dati della tua famiglia.',
        `Il camp è pensato per ragazzi e ragazze tra i ${GUEST_AGE.min} e i ${GUEST_AGE.max} anni. Dalle date di nascita che hai inserito, nessuno dei ragazzi per cui chiedete di partecipare rientra in questa fascia.`,
        'La tua richiesta resta registrata: la valutiamo e ti scriviamo. Se una data di nascita è sbagliata, puoi correggerla dalla pagina Componenti.',
      ),
      actionLabel: 'Apri i componenti',
      after: 'Lo staff di Invictus Camp',
    }),
  },

  // ─── Staff ─────────────────────────────────────────────────────────────────────────────────────
  'staff.convocation': {
    area: 'staff',
    label: 'Convocazione',
    recipient: 'La persona dello staff convocata',
    trigger:
      'Quando invii le convocazioni di una sessione. Il messaggio che scrivi in quel momento si aggiunge dopo il testo.',
    fields: SESSION_FIELDS,
    defaults: texts({
      subject: 'Convocazione per «{sessione}»',
      preheader: 'Una convocazione per «{sessione}»: rispondi dal gestionale.',
      title: 'Ti convochiamo per una sessione del camp',
      body: 'ti convochiamo per la sessione «{sessione}».',
      actionLabel: 'Rispondi alla convocazione',
      after:
        'Puoi accettare o rifiutare dal gestionale. Se accetti, ti chiederemo di firmare il contratto della sessione.',
    }),
  },
  'staff.convocation_cancelled': {
    area: 'staff',
    label: 'Convocazione annullata',
    recipient: 'La persona dello staff',
    trigger: 'Quando annulli una convocazione già inviata.',
    fields: SESSION_FIELDS,
    defaults: texts({
      subject: 'Convocazione annullata: «{sessione}»',
      preheader: 'La convocazione per «{sessione}» è stata annullata.',
      title: 'Convocazione annullata',
      body: paragraphs('abbiamo annullato la tua convocazione per la sessione «{sessione}».', NOTHING_TO_DO),
      actionLabel: 'Vedi le tue sessioni',
    }),
  },
  'staff.session_cancelled': {
    area: 'staff',
    label: 'Sessione annullata (staff)',
    recipient: 'Lo staff convocato',
    trigger: 'Quando annulli una sessione: a chi dello staff aveva ricevuto la convocazione.',
    fields: SESSION_FIELDS,
    defaults: texts({
      subject: 'Sessione annullata: «{sessione}»',
      preheader: 'La sessione «{sessione}» è stata annullata.',
      title: 'Sessione annullata',
      body: paragraphs('abbiamo annullato la sessione «{sessione}»: la tua convocazione non vale più.', NOTHING_TO_DO),
      actionLabel: 'Vedi le tue sessioni',
    }),
  },
  'staff.availability_reopened': {
    area: 'staff',
    label: 'Disponibilità riaperta',
    recipient: 'La persona dello staff',
    trigger: 'Quando riapri la disponibilità di una persona dello staff.',
    fields: NAME_ONLY,
    defaults: texts({
      subject: 'Puoi cambiare la tua disponibilità',
      preheader: 'Puoi cambiare la tua disponibilità e confermarla di nuovo.',
      title: 'Puoi cambiare la tua disponibilità',
      body: paragraphs(
        'abbiamo riaperto la tua disponibilità: puoi cambiare le sessioni per cui sei disponibile.',
        'Quando hai finito, confermala di nuovo.',
      ),
      actionLabel: 'Vai alla disponibilità',
    }),
  },
  'staff.approved': {
    area: 'staff',
    label: 'Candidatura approvata',
    recipient: 'Chi si è candidato',
    trigger: 'Quando premi «Comunica l’esito» per una candidatura approvata. Il testo qui è quello che ti proponiamo.',
    fields: NAME_ONLY,
    alwaysOn: SENT_BY_HAND,
    defaults: texts({
      subject: 'La tua candidatura per lo staff è stata accettata',
      preheader: 'La tua candidatura è stata accettata.',
      title: 'La tua candidatura è stata accettata',
      body: paragraphs(
        'la tua candidatura per lo staff di Invictus Camp è stata accettata: ti diamo il benvenuto nella squadra.',
        'Ora puoi indicare nel gestionale a quali sessioni puoi venire. Ti convocheremo per quelle, e potrai accettare o rifiutare ogni convocazione.',
        'Grazie per aver scelto di esserci.',
      ),
      actionLabel: 'Entra nel gestionale',
      after: 'Lo staff di Invictus Camp',
    }),
  },
  'staff.rejected': {
    area: 'staff',
    label: 'Candidatura non accolta',
    recipient: 'Chi si è candidato',
    trigger:
      'Quando premi «Comunica l’esito» per una candidatura non accolta. Il testo qui è quello che ti proponiamo.',
    fields: NAME_ONLY,
    alwaysOn: SENT_BY_HAND,
    defaults: texts({
      subject: 'L’esito della tua candidatura',
      preheader: 'L’esito della tua candidatura.',
      title: 'L’esito della tua candidatura',
      body: paragraphs(
        'grazie per l’interesse e per il tempo che hai dedicato alla candidatura per lo staff di Invictus Camp.',
        'Abbiamo letto con attenzione quello che ci hai scritto. Per questa stagione non possiamo inserirti nella squadra.',
        'Ti ringraziamo ancora e ti auguriamo il meglio.',
      ),
      after: 'Lo staff di Invictus Camp',
    }),
  },

  // ─── Documents and signatures ──────────────────────────────────────────────────────────────────
  'signature.request': {
    area: 'documents',
    label: 'Documento da firmare',
    recipient: 'Chi deve firmare',
    trigger:
      'Quando assegni un documento da firmare, e quando una persona dello staff accetta una convocazione con un contratto da firmare.',
    fields: DOCUMENT_FIELDS,
    defaults: texts({
      subject: 'Documento da firmare, «{documento}»',
      preheader: 'Leggi e firma «{documento}» nel gestionale.',
      title: 'Hai un documento da firmare',
      body: SIGN_BODY,
      actionLabel: 'Leggi e firma',
    }),
  },
  'signature.reminder': {
    area: 'documents',
    label: 'Promemoria di firma',
    recipient: 'Chi non ha ancora firmato',
    trigger: 'Quando invii un promemoria per un documento da firmare.',
    fields: DOCUMENT_FIELDS,
    defaults: texts({
      subject: 'Promemoria: documento da firmare, «{documento}»',
      preheader: 'Leggi e firma «{documento}» nel gestionale.',
      title: 'Promemoria: un documento da firmare',
      body: SIGN_BODY,
      actionLabel: 'Leggi e firma',
    }),
  },
  'document.read': {
    area: 'documents',
    label: 'Documento da leggere',
    recipient: 'Chi deve leggerlo',
    trigger: 'Quando assegni un documento da leggere, senza firma.',
    fields: DOCUMENT_FIELDS,
    defaults: texts({
      subject: 'Documento da leggere, «{documento}»',
      preheader: 'Leggi «{documento}» nel gestionale.',
      title: 'Hai un documento da leggere',
      body: READ_BODY,
      actionLabel: 'Leggi il documento',
    }),
  },
  'document.read_reminder': {
    area: 'documents',
    label: 'Promemoria di lettura',
    recipient: 'Chi non lo ha ancora letto',
    trigger: 'Quando invii un promemoria per un documento da leggere.',
    fields: DOCUMENT_FIELDS,
    defaults: texts({
      subject: 'Promemoria: documento da leggere, «{documento}»',
      preheader: 'Leggi «{documento}» nel gestionale.',
      title: 'Promemoria: un documento da leggere',
      body: READ_BODY,
      actionLabel: 'Leggi il documento',
    }),
  },
  'signature.signed': {
    area: 'documents',
    label: 'Firma completata',
    recipient: 'Chi ha firmato',
    trigger: 'Quando qualcuno completa la firma di un documento.',
    fields: DOCUMENT_FIELDS,
    defaults: texts({
      subject: 'Hai firmato «{documento}»',
      preheader: 'Hai firmato «{documento}». La copia firmata è nel gestionale.',
      title: 'Firma completata',
      body: paragraphs(
        'hai firmato il documento «{documento}». Grazie.',
        'La copia firmata, con la pagina che certifica la firma, resta sempre disponibile nel gestionale.',
      ),
      actionLabel: 'Scarica la copia firmata',
      footnote: 'Se non hai firmato tu questo documento, avvisaci subito.',
    }),
  },
  'signature.otp': {
    area: 'documents',
    label: 'Codice di firma',
    recipient: 'Chi sta firmando',
    trigger: 'Quando qualcuno sta firmando un documento e chiede il codice per confermare.',
    fields: DOCUMENT_FIELDS,
    alwaysOn: 'Contiene il codice che conferma la firma: senza, nessuno potrebbe firmare.',
    defaults: texts({
      subject: 'Il tuo codice per firmare il documento',
      preheader: 'Il codice per confermare la tua firma. Vale 10 minuti.',
      title: 'Il codice per confermare la firma',
      body: 'per firmare «{documento}» inserisci questo codice nel gestionale. Vale 10 minuti.',
      footnote: 'Se non stai firmando un documento, non usare il codice e avvisaci.',
    }),
  },

  // ─── Access ────────────────────────────────────────────────────────────────────────────────────
  'auth.invite_family': {
    area: 'access',
    label: 'Invito al gestionale: famiglia',
    recipient: 'La famiglia',
    trigger: INVITE_TRIGGER,
    fields: NAME_ONLY,
    alwaysOn: ACCESS_LINK,
    defaults: invite(
      'ti abbiamo creato l’accesso al gestionale di Invictus Camp per la tua famiglia. Da qui potrai inserire i dati dei componenti, caricare i documenti e seguire le sessioni a cui partecipate.',
    ),
  },
  'auth.invite_staff': {
    area: 'access',
    label: 'Invito al gestionale: staff',
    recipient: 'La persona dello staff',
    trigger: INVITE_TRIGGER,
    fields: NAME_ONLY,
    alwaysOn: ACCESS_LINK,
    defaults: invite(
      'ti abbiamo creato l’accesso al gestionale di Invictus Camp come membro dello staff. Da qui potrai indicare la tua disponibilità, ricevere le convocazioni e firmare i documenti.',
    ),
  },
  'auth.invite_admin': {
    area: 'access',
    label: 'Invito al gestionale: amministrazione',
    recipient: 'Chi entra nell’amministrazione',
    trigger: INVITE_TRIGGER,
    fields: NAME_ONLY,
    alwaysOn: ACCESS_LINK,
    defaults: invite('ti abbiamo creato un accesso al gestionale di Invictus Camp, nell’area dell’amministrazione.'),
  },
  'auth.verify_email': {
    area: 'access',
    label: 'Conferma dell’indirizzo',
    recipient: 'Chi si registra',
    trigger:
      'Quando una famiglia o un candidato dello staff si registra, e quando chiede di nuovo il link di conferma.',
    fields: NAME_ONLY,
    alwaysOn: ACCESS_LINK,
    defaults: texts({
      subject: 'Conferma il tuo indirizzo email',
      preheader: 'Un clic per confermare il tuo indirizzo.',
      title: 'Conferma il tuo indirizzo email',
      body: paragraphs(
        'grazie per la registrazione al gestionale di Invictus Camp.',
        'Conferma il tuo indirizzo email per entrare. Il link vale 48 ore.',
      ),
      actionLabel: 'Conferma l’indirizzo',
      footnote: 'Se non hai chiesto tu la registrazione, ignora questa email: senza conferma l’account non si attiva.',
    }),
  },
  'auth.reset_password': {
    area: 'access',
    label: 'Reimpostazione della password',
    recipient: 'Chi ha chiesto la nuova password',
    trigger: 'Quando qualcuno chiede di reimpostare la password, o la reimposti tu dalla pagina Utenti.',
    fields: NAME_ONLY,
    alwaysOn: ACCESS_LINK,
    defaults: texts({
      subject: 'Reimposta la password',
      preheader: 'Il link per scegliere una nuova password.',
      title: 'Reimposta la tua password',
      body: 'abbiamo ricevuto una richiesta per reimpostare la password del tuo account. Il link vale un’ora.',
      actionLabel: 'Scegli una nuova password',
      footnote: 'Se non hai chiesto tu di cambiare la password, ignora questa email: quella attuale resta valida.',
    }),
  },
} as const satisfies Record<string, AutomaticEmailDefinition>

export type AutomaticEmailKey = keyof typeof AUTOMATIC_EMAILS
export const AUTOMATIC_EMAIL_KEYS = Object.keys(AUTOMATIC_EMAILS) as AutomaticEmailKey[]

/** The texts the administration changed, by email; an email that is not here uses its defaults. */
export type EmailTextsByKey = Partial<Record<AutomaticEmailKey, EmailTexts>>

export function isAutomaticEmailKey(value: string): value is AutomaticEmailKey {
  return Object.hasOwn(AUTOMATIC_EMAILS, value)
}

export function automaticEmailDefinition(key: AutomaticEmailKey): AutomaticEmailDefinition {
  return AUTOMATIC_EMAILS[key]
}

/** Whether the email has a button (its address is fixed by the platform). */
export function hasEmailAction(key: AutomaticEmailKey): boolean {
  return AUTOMATIC_EMAILS[key].defaults.actionLabel !== ''
}

/** The help under the texts of an email: the fields it fills by itself. */
export function emailFieldsHelp(key: AutomaticEmailKey): string {
  const fields = AUTOMATIC_EMAILS[key].fields
  return fields.length === 1
    ? `{${fields[0]}} si compila da solo per ogni destinatario.`
    : `Si compilano da soli per ogni destinatario ${fields.map(field => `{${field}}`).join(', ')}.`
}

/** Writes the values of the email's fields in; anything else in braces stays as written. */
export function fillEmailFields(key: AutomaticEmailKey, text: string, values: EmailFieldValues): string {
  return textFields(AUTOMATIC_EMAILS[key].fields).fill(text, values)
}

/** The first field in braces the email cannot fill ("{cognome}", or {sessione} in a document email), or null. */
export function emailFieldIssue(key: AutomaticEmailKey, text: string): string | null {
  const fields = textFields(AUTOMATIC_EMAILS[key].fields)
  for (const [field, name] of text.matchAll(FIELD)) {
    if (!fields.isField(name!)) return fields.unknown(field)
  }
  return null
}
