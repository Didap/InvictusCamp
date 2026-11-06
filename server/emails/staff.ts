// Emails of the staff area: the outcome of a review (written or kept by the administration and sent
// only from "Comunica l’esito"), a convocation to a session and its cancellation. No health details,
// no access links: they are kept in email_log.
import { enumLabel, type StaffRole } from '../../shared/utils/constants'
import type { StaffOutcomeTemplate } from '../../shared/types/staff'
import { formatDayRange } from '../../shared/utils/format'
import { appLink, renderEmail } from './layout'
import type { EmailContext, EmailMessage } from './types'

interface Recipient {
  to: string
  toUserId: string
  firstName: string
}

interface ConvocationSession {
  id: string
  title: string
  startDate: string
  endDate: string
  location: string
}

const DEFAULT_OUTCOME: Record<StaffOutcomeTemplate, string> = {
  'staff.approved': [
    'la tua candidatura per lo staff di Invictus Camp è stata accettata: ti diamo il benvenuto nella squadra.',
    'Ora puoi indicare nel gestionale i periodi in cui sei disponibile. Ti convocheremo per le sessioni che corrispondono alle tue date, e potrai accettare o rifiutare ogni convocazione.',
    'Grazie per aver scelto di esserci.',
  ].join('\n\n'),
  'staff.rejected': [
    'grazie per l’interesse e per il tempo che hai dedicato alla candidatura per lo staff di Invictus Camp.',
    'Abbiamo letto con attenzione quello che ci hai scritto. Per questa stagione non possiamo inserirti nella squadra.',
    'Ti ringraziamo ancora e ti auguriamo il meglio.',
  ].join('\n\n'),
}

const OUTCOME_SUBJECT: Record<StaffOutcomeTemplate, string> = {
  'staff.approved': 'La tua candidatura per lo staff è stata accettata',
  'staff.rejected': 'L’esito della tua candidatura',
}

export function outcomeSubject(template: StaffOutcomeTemplate): string {
  return OUTCOME_SUBJECT[template]
}

/** The text proposed to the administration before sending the outcome; the email adds the greeting. */
export function defaultOutcomeMessage(template: StaffOutcomeTemplate): string {
  return DEFAULT_OUTCOME[template]
}

/** Paragraphs of a text written in the dashboard: blank lines separate them, single breaks are spaces. */
export function messageParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(part => part.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}

/** "Esito della candidatura": the message the administration kept or wrote, sent when it chose to. */
export function staffOutcomeEmail(
  ctx: EmailContext,
  input: Recipient & { template: StaffOutcomeTemplate; message: string },
): EmailMessage {
  const approved = input.template === 'staff.approved'
  const { html, text } = renderEmail(ctx, {
    preheader: approved ? 'La tua candidatura è stata accettata.' : 'L’esito della tua candidatura.',
    title: approved ? 'La tua candidatura è stata accettata' : 'L’esito della tua candidatura',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: messageParagraphs(input.message),
    action: approved ? { label: 'Entra nel gestionale', url: appLink(ctx, '/staff') } : undefined,
    after: ['Lo staff di Invictus Camp'],
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: input.template,
    subject: OUTCOME_SUBJECT[input.template],
    html,
    text,
  }
}

function sessionDetails(session: ConvocationSession, role: StaffRole | null) {
  const details = [
    { label: 'Sessione', value: session.title },
    { label: 'Date', value: formatDayRange(session.startDate, session.endDate, 'long') },
    { label: 'Luogo', value: session.location },
  ]
  if (role) details.push({ label: 'Ruolo', value: enumLabel('staffRole', role) })
  return details
}

/** `staff.convocation`: sent by "Invia la convocazione". */
export function convocationEmail(
  ctx: EmailContext,
  input: Recipient & { session: ConvocationSession; role: StaffRole | null; message?: string | null },
): EmailMessage {
  const { html, text } = renderEmail(ctx, {
    preheader: `Una convocazione per «${input.session.title}»: rispondi dal gestionale.`,
    title: 'Ti convochiamo per una sessione del camp',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [
      `l’amministrazione di Invictus Camp ti convoca per la sessione «${input.session.title}».`,
      ...messageParagraphs(input.message ?? ''),
    ],
    details: sessionDetails(input.session, input.role),
    action: { label: 'Rispondi alla convocazione', url: appLink(ctx, '/staff/convocazioni') },
    after: [
      'Puoi accettare o rifiutare dal gestionale. Se accetti, ti chiederemo di firmare il contratto della sessione.',
    ],
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: 'staff.convocation',
    subject: `Convocazione per «${input.session.title}»`,
    html,
    text,
    sessionId: input.session.id,
  }
}

/** `staff.convocation_cancelled`: a convocation that had been sent is withdrawn. */
export function convocationCancelledEmail(
  ctx: EmailContext,
  input: Recipient & { session: ConvocationSession; role: StaffRole | null },
): EmailMessage {
  const { html, text } = renderEmail(ctx, {
    preheader: `La convocazione per «${input.session.title}» è stata annullata.`,
    title: 'Convocazione annullata',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [
      `l’amministrazione di Invictus Camp ha annullato la tua convocazione per la sessione «${input.session.title}».`,
      'Non devi fare nulla. Se hai domande, scrivi all’amministrazione del camp.',
    ],
    details: sessionDetails(input.session, input.role),
    action: { label: 'Vedi le tue convocazioni', url: appLink(ctx, '/staff/convocazioni') },
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: 'staff.convocation_cancelled',
    subject: `Convocazione annullata: «${input.session.title}»`,
    html,
    text,
    sessionId: input.session.id,
  }
}
