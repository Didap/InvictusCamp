/**
 * The WhatsApp chat with a phone number ("https://wa.me/393331234567"), or null when the number cannot have
 * WhatsApp as far as we can tell: an Italian landline, or a number too short or too long. Without a prefix
 * (+, 00, or 39 before a full number) the number is Italian.
 */
export function whatsappUrl(phone: string | null | undefined): string | null {
  // A leading + is 00; "(0)" is the trunk zero some write after the prefix ("+41 (0)79…"), not dialled from abroad.
  const digits = (phone ?? '')
    .replace(/\(0\)/g, '')
    .replace(/^\D*\+/, '00')
    .replace(/\D/g, '')
  const international = digits.startsWith('00')
    ? digits.slice(2)
    : digits.startsWith('39') && digits.length > 10
      ? digits
      : `39${digits}`
  // In Italy only mobiles (3…, 9 or 10 digits) have WhatsApp; elsewhere any number of a valid length.
  const valid = international.startsWith('39')
    ? /^393\d{8,9}$/.test(international)
    : /^[1-9]\d{7,14}$/.test(international)
  return valid ? `https://wa.me/${international}` : null
}

/**
 * "Scrivi su WhatsApp": a link (button or menu item) that opens the chat with the number in a new tab, from
 * the WhatsApp of this device. Undefined when the number cannot have WhatsApp (no number, a landline).
 */
export function whatsappLink(phone: string | null | undefined) {
  const to = whatsappUrl(phone)
  if (!to) return undefined
  // The arrow of a link that opens a new tab, as a menu item shows it by itself.
  return {
    label: 'Scrivi su WhatsApp',
    icon: 'i-lucide-message-circle',
    trailingIcon: 'i-lucide-arrow-up-right',
    to,
    target: '_blank',
  }
}
