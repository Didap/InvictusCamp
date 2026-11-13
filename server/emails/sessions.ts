// Emails of the sessions area (docs/spec.md, 4): the invitation of a titolare, the notice to a reserve,
// a place offered to a reserve, the session confirmed or cancelled, a family removed, the end-of-session
// questionnaire. They speak to
// the family's account ("tu"), carry the session's facts and never any health detail.
import type { ParticipationKind } from '../../shared/utils/constants'
import { formatDay, formatDayRange } from '../../shared/utils/format'
import { appLink, renderEmail, type EmailContent } from './layout'
import type { EmailContext, EmailMessage } from './types'

/** The facts of a session an email shows. */
export interface SessionEmailFacts {
  id: string
  title: string
  location: string
  startDate: string
  endDate: string
  responseDeadline: string | null
}

/** The family's account. */
export interface FamilyRecipient {
  to: string
  toUserId: string
  firstName: string
}

export type SessionEmailTemplate =
  | 'session.invite'
  | 'session.reserve'
  | 'session.slot_offered'
  | 'session.confirmed'
  | 'session.cancelled'
  | 'session.removed'
  | 'session.feedback'

const FAMILY_SESSIONS_PATH = '/famiglia/sessioni'

function facts(session: SessionEmailFacts, options: { deadline?: boolean } = {}) {
  const rows = [
    { label: 'Sessione', value: session.title },
    { label: 'Date', value: formatDayRange(session.startDate, session.endDate, 'long') },
    { label: 'Luogo', value: session.location },
  ]
  if (options.deadline && session.responseDeadline) {
    rows.push({ label: 'Rispondi entro', value: formatDay(session.responseDeadline, 'long') })
  }
  return rows
}

function message(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
  template: SessionEmailTemplate,
  subject: string,
  content: Omit<EmailContent, 'greeting'>,
): EmailMessage {
  const { html, text } = renderEmail(ctx, { ...content, greeting: `Ciao ${recipient.firstName},` })
  return {
    to: recipient.to,
    toUserId: recipient.toUserId,
    template,
    subject,
    html,
    text,
    sessionId: session.id,
  }
}

/** session.invite: a titolare is invited (the session opens, or the family is added while it is open). */
export function sessionInviteEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
  options: { reminder?: boolean } = {},
): EmailMessage {
  return message(
    ctx,
    recipient,
    session,
    'session.invite',
    `${options.reminder ? 'Promemoria invito' : 'Invito'}: ${session.title}`,
    {
      preheader: `La tua famiglia è invitata a «${session.title}». Conferma o rinuncia dal gestionale.`,
      title: options.reminder ? 'Promemoria: rispondi all’invito' : 'La tua famiglia è invitata al camp',
      paragraphs: [
        `la tua famiglia è invitata a partecipare a «${session.title}» di Invictus Camp.`,
        'Conferma la partecipazione o rinuncia dal gestionale. Se rinunci, il posto passa a un’altra famiglia in attesa.',
      ],
      details: facts(session, { deadline: true }),
      action: { label: 'Rispondi all’invito', url: appLink(ctx, FAMILY_SESSIONS_PATH) },
    },
  )
}

/** session.reserve: the family is on the reserve list of the session. */
export function sessionReserveEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  return message(ctx, recipient, session, 'session.reserve', `Lista di riserva: ${session.title}`, {
    preheader: `La tua famiglia è in lista di riserva per «${session.title}».`,
    title: 'La tua famiglia è in lista di riserva',
    paragraphs: [
      `i posti di «${session.title}» sono tutti assegnati e la tua famiglia è in lista di riserva.`,
      'Se si libera un posto ti scriviamo subito e potrai confermare dal gestionale. Per ora non devi fare nulla.',
    ],
    details: facts(session),
    action: { label: 'Vedi le tue sessioni', url: appLink(ctx, FAMILY_SESSIONS_PATH) },
  })
}

/** session.slot_offered: a reserve is called to a free place. */
export function sessionSlotOfferedEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  return message(ctx, recipient, session, 'session.slot_offered', `Si è liberato un posto: ${session.title}`, {
    preheader: `C’è un posto per la tua famiglia in «${session.title}». Conferma o rinuncia dal gestionale.`,
    title: 'Si è liberato un posto per la tua famiglia',
    paragraphs: [
      `si è liberato un posto in «${session.title}» e la tua famiglia, che era in lista di riserva, può partecipare.`,
      'Conferma la partecipazione o rinuncia dal gestionale. Se rinunci, il posto passa alla prossima famiglia in attesa.',
    ],
    details: facts(session, { deadline: true }),
    action: { label: 'Rispondi all’invito', url: appLink(ctx, FAMILY_SESSIONS_PATH) },
  })
}

/** session.confirmed: the session will take place (to the titolari who confirmed). */
export function sessionConfirmedEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  return message(ctx, recipient, session, 'session.confirmed', `Sessione confermata: ${session.title}`, {
    preheader: `«${session.title}» si farà: ti aspettiamo al camp.`,
    title: 'La sessione è confermata',
    paragraphs: [
      `«${session.title}» è confermata: la tua famiglia è tra i partecipanti e ti aspettiamo al camp.`,
      'Nel gestionale trovi i dettagli della sessione e i documenti da firmare, se ce ne sono.',
    ],
    details: facts(session),
    action: { label: 'Apri le tue sessioni', url: appLink(ctx, FAMILY_SESSIONS_PATH) },
  })
}

/** session.cancelled: the session will not take place (to the families invited or confirmed). */
export function sessionCancelledEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  return message(ctx, recipient, session, 'session.cancelled', `Sessione annullata: ${session.title}`, {
    preheader: `«${session.title}» è stata annullata.`,
    title: 'La sessione è stata annullata',
    paragraphs: [
      `ci dispiace: «${session.title}» è stata annullata e non si terrà.`,
      'Per qualsiasi domanda contatta l’amministrazione del camp. Ti scriveremo quando ci saranno nuove sessioni.',
    ],
    details: facts(session),
  })
}

/** session.removed: the administration removed a family that had been invited. */
export function sessionRemovedEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
  kind: ParticipationKind,
): EmailMessage {
  return message(ctx, recipient, session, 'session.removed', `Partecipazione annullata: ${session.title}`, {
    preheader: `Un aggiornamento sulla tua partecipazione a «${session.title}».`,
    title: 'Un aggiornamento sulla tua partecipazione',
    paragraphs: [
      kind === 'reserve'
        ? `la tua famiglia non è più nella lista di riserva di «${session.title}».`
        : `la partecipazione della tua famiglia a «${session.title}» è stata annullata dall’amministrazione del camp.`,
      'Se pensi che sia un errore o vuoi saperne di più, contatta l’amministrazione del camp.',
    ],
    details: facts(session),
  })
}

/** session.feedback: the session is over, the families who took part answer the questionnaire. */
export function sessionFeedbackEmail(
  ctx: EmailContext,
  recipient: FamilyRecipient,
  session: SessionEmailFacts,
): EmailMessage {
  return message(ctx, recipient, session, 'session.feedback', `Com’è andata? ${session.title}`, {
    preheader: `Raccontaci com’è andata «${session.title}»: bastano pochi minuti.`,
    title: 'Com’è andata al camp?',
    paragraphs: [
      `grazie per aver partecipato a «${session.title}».`,
      'Ci aiuti a preparare le prossime sessioni? Dai un voto alle attività e, se vuoi, scrivici cosa ti è piaciuto e cosa cambieresti. Bastano pochi minuti e le risposte arrivano all’amministrazione senza il nome della tua famiglia.',
    ],
    details: facts(session),
    action: { label: 'Rispondi al questionario', url: appLink(ctx, `/famiglia/questionario/${session.id}`) },
  })
}
