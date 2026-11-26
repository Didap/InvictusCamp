// Emails of the staff area: the outcome of a review (written or kept by the administration and sent
// only from "Comunica l’esito"), a convocation to a session and its cancellation, the availability reopened. No health details,
// no access links: they are kept in email_log.
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
    'Ora puoi indicare nel gestionale a quali sessioni puoi venire. Ti convocheremo per quelle, e potrai accettare o rifiutare ogni convocazione.',
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

function sessionDetails(session: ConvocationSession, roleName: string | null) {
  const details = [
    { label: 'Sessione', value: session.title },
    { label: 'Date', value: formatDayRange(session.startDate, session.endDate, 'long') },
    { label: 'Luogo', value: session.location },
  ]
  if (roleName) details.push({ label: 'Ruolo', value: roleName })
  return details
}

/** `staff.convocation`: sent by "Invia la convocazione". */
export function convocationEmail(
  ctx: EmailContext,
  input: Recipient & { session: ConvocationSession; roleName: string | null; message?: string | null },
): EmailMessage {
  const { html, text } = renderEmail(ctx, {
    preheader: `Una convocazione per «${input.session.title}»: rispondi dal gestionale.`,
    title: 'Ti convochiamo per una sessione del camp',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [
      `l’amministrazione di Invictus Camp ti convoca per la sessione «${input.session.title}».`,
      ...messageParagraphs(input.message ?? ''),
    ],
    details: sessionDetails(input.session, input.roleName),
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

/**
 * `staff.convocation_cancelled`: a convocation that had been sent is withdrawn, alone or because the whole
 * session was cancelled (`sessionCancelled`), which the person is told.
 */
export function convocationCancelledEmail(
  ctx: EmailContext,
  input: Recipient & { session: ConvocationSession; roleName: string | null; sessionCancelled?: boolean },
): EmailMessage {
  const title = input.session.title
  const { html, text } = renderEmail(ctx, {
    preheader: input.sessionCancelled
      ? `La sessione «${title}» è stata annullata.`
      : `La convocazione per «${title}» è stata annullata.`,
    title: input.sessionCancelled ? 'Sessione annullata' : 'Convocazione annullata',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [
      input.sessionCancelled
        ? `l’amministrazione di Invictus Camp ha annullato la sessione «${title}»: la tua convocazione non vale più.`
        : `l’amministrazione di Invictus Camp ha annullato la tua convocazione per la sessione «${title}».`,
      'Non devi fare nulla. Se hai domande, scrivi all’amministrazione del camp.',
    ],
    details: sessionDetails(input.session, input.roleName),
    action: { label: 'Vedi le tue sessioni', url: appLink(ctx, '/staff/sessioni') },
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: 'staff.convocation_cancelled',
    subject: input.sessionCancelled ? `Sessione annullata: «${title}»` : `Convocazione annullata: «${title}»`,
    html,
    text,
    sessionId: input.session.id,
  }
}

/** The administration reopened the availability (after «Chiedi il reset», or on its own). */
export function availabilityReopenedEmail(ctx: EmailContext, input: Recipient): EmailMessage {
  const { html, text } = renderEmail(ctx, {
    preheader: 'Puoi cambiare la tua disponibilità e confermarla di nuovo.',
    title: 'Puoi cambiare la tua disponibilità',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [
      'l’amministrazione di Invictus Camp ha riaperto la tua disponibilità: puoi cambiare le sessioni a cui ci sei.',
      'Quando hai finito, confermala di nuovo.',
    ],
    action: { label: 'Vai alla disponibilità', url: appLink(ctx, '/staff/disponibilita') },
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: 'staff.availability_reopened',
    subject: 'Puoi cambiare la tua disponibilità',
    html,
    text,
  }
}
