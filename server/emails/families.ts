// Emails of the families area. No health details: the age notice speaks of the camp's ages, never of a
// person's condition.
import { GUEST_AGE } from '../../shared/utils/constants'
import { appLink, renderEmail } from './layout'
import type { EmailContext, EmailMessage } from './types'

/** To a family whose young people with a condition are all outside the camp's ages (docs/spec.md, 3.8). */
export function guestAgeEmail(
  ctx: EmailContext,
  input: { to: string; toUserId: string; firstName: string },
): EmailMessage {
  const { html, text } = renderEmail(ctx, {
    preheader: `Il camp accoglie ragazzi e ragazze tra i ${GUEST_AGE.min} e i ${GUEST_AGE.max} anni.`,
    title: 'Sull’età dei ragazzi che accogliamo',
    greeting: `Ciao ${input.firstName},`,
    paragraphs: [
      'grazie per aver completato i dati della tua famiglia.',
      `Il camp è pensato per ragazzi e ragazze tra i ${GUEST_AGE.min} e i ${GUEST_AGE.max} anni. Dalle date di nascita che hai inserito, nessuno dei ragazzi per cui chiedete di partecipare rientra in questa fascia.`,
      'La tua richiesta resta registrata: l’amministrazione la valuta e ti scrive. Se una data di nascita è sbagliata, puoi correggerla dalla pagina Componenti.',
    ],
    action: { label: 'Apri i componenti', url: appLink(ctx, '/famiglia/membri') },
    after: ['Lo staff di Invictus Camp'],
  })
  return {
    to: input.to,
    toUserId: input.toUserId,
    template: 'family.age_notice',
    subject: 'Sull’età dei ragazzi che accogliamo',
    html,
    text,
  }
}
