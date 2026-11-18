import { whatsappUrl } from '#shared/utils/format'

/**
 * "Scrivi su WhatsApp": a link (button or menu item) that opens the chat with the number in a new tab, from
 * the WhatsApp of this device. Undefined when the number cannot have WhatsApp (no number, a landline).
 */
export function whatsappLink(phone: string | null | undefined) {
  const to = whatsappUrl(phone)
  return to ? { label: 'Scrivi su WhatsApp', icon: 'i-lucide-message-circle', to, target: '_blank' } : undefined
}
