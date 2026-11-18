import { describe, expect, it } from 'vitest'
import { whatsappUrl } from '#shared/utils/format'

describe('whatsappUrl', () => {
  it('reads an Italian mobile in every way families write it', () => {
    for (const phone of [
      '333 123 4567',
      '3331234567',
      '333-123.4567',
      '(333) 1234567',
      '+39 333 123 4567',
      '0039 333 1234567',
      '39 333 1234567',
      ' +393331234567 ',
    ]) {
      expect(whatsappUrl(phone), phone).toBe('https://wa.me/393331234567')
    }
  })

  it('keeps Italian mobiles that start with 39 and the old 9-digit ones', () => {
    expect(whatsappUrl('393 123 4567')).toBe('https://wa.me/393931234567')
    expect(whatsappUrl('338 123456')).toBe('https://wa.me/39338123456')
  })

  it('keeps a foreign number with its prefix', () => {
    expect(whatsappUrl('+41 79 123 45 67')).toBe('https://wa.me/41791234567')
    expect(whatsappUrl('0049 151 23456789')).toBe('https://wa.me/4915123456789')
  })

  it('gives no chat for landlines, empty or broken numbers', () => {
    for (const phone of [
      '099 9711234',
      '+39 099 9711234',
      '0039 06 1234567',
      '',
      '   ',
      null,
      undefined,
      '333',
      '3'.repeat(20),
    ]) {
      expect(whatsappUrl(phone), String(phone)).toBeNull()
    }
  })
})
