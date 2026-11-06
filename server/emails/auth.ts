// Access emails: invitation, address confirmation, password reset. They carry one-time links, so
// they are `sensitive` (not kept in email_log) and, when simulated in development, the link is
// printed in the server console.
import type { UserRole } from '../../shared/utils/constants'
import { appLink, renderEmail } from './layout'
import type { EmailContext, EmailMessage } from './types'

interface Recipient {
  to: string
  toUserId: string
  firstName: string
}

const ROLE_INTRO: Record<UserRole, string> = {
  admin: 'ti abbiamo creato un accesso al gestionale di Invictus Camp, nell’area dell’amministrazione.',
  family:
    'ti abbiamo creato l’accesso al gestionale di Invictus Camp per la tua famiglia. Da qui potrai inserire i dati dei componenti, caricare i documenti e seguire le sessioni a cui partecipate.',
  staff:
    'ti abbiamo creato l’accesso al gestionale di Invictus Camp come membro dello staff. Da qui potrai indicare la tua disponibilità, ricevere le convocazioni e firmare i documenti.',
}

export function inviteEmail(ctx: EmailContext, input: Recipient & { role: UserRole; token: string }): EmailMessage {
  const url = appLink(ctx, `/invito?token=${encodeURIComponent(input.token)}`)
  const { html, text } = renderEmail(ctx, {
    preheader: 'Scegli la tua password per entrare nel gestionale.',
    title: 'Il tuo accesso al gestionale',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [ROLE_INTRO[input.role], 'Per entrare scegli la tua password. Il link vale 7 giorni.'],
    action: { label: 'Scegli la password', url },
    footnote: 'Se non aspettavi questo invito, puoi ignorare questa email.',
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: 'auth.invite',
    subject: 'Il tuo accesso al gestionale di Invictus Camp',
    html,
    text,
    sensitive: true,
    devNote: url,
  }
}

export function verifyEmailEmail(ctx: EmailContext, input: Recipient & { token: string }): EmailMessage {
  const url = appLink(ctx, `/verifica-email?token=${encodeURIComponent(input.token)}`)
  const { html, text } = renderEmail(ctx, {
    preheader: 'Un clic per confermare il tuo indirizzo.',
    title: 'Conferma il tuo indirizzo email',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [
      'grazie per la registrazione al gestionale di Invictus Camp.',
      'Conferma il tuo indirizzo email per entrare. Il link vale 48 ore.',
    ],
    action: { label: 'Conferma l’indirizzo', url },
    footnote: 'Se non hai chiesto tu la registrazione, ignora questa email: senza conferma l’account non si attiva.',
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: 'auth.verify_email',
    subject: 'Conferma il tuo indirizzo email',
    html,
    text,
    sensitive: true,
    devNote: url,
  }
}

export function resetPasswordEmail(ctx: EmailContext, input: Recipient & { token: string }): EmailMessage {
  const url = appLink(ctx, `/reimposta-password?token=${encodeURIComponent(input.token)}`)
  const { html, text } = renderEmail(ctx, {
    preheader: 'Il link per scegliere una nuova password.',
    title: 'Reimposta la tua password',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: ['abbiamo ricevuto una richiesta per reimpostare la password del tuo account. Il link vale un’ora.'],
    action: { label: 'Scegli una nuova password', url },
    footnote: 'Se non hai chiesto tu di cambiare la password, ignora questa email: quella attuale resta valida.',
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: 'auth.reset_password',
    subject: 'Reimposta la password',
    html,
    text,
    sensitive: true,
    devNote: url,
  }
}
