import { z } from 'zod'
import { STAFF_TEAMS } from '../utils/constants'
import { ageOn } from '../utils/dates'
import { zBirthDate, zEmail, zPassword, zPersonName, zPhone, zRequiredPhone, zRequiredText, zToken } from './common'

/** A checkbox that must be ticked (boolean in the form, true on the server). */
export const zPrivacy = z
  .boolean()
  .refine(value => value === true, { error: 'Per continuare serve il consenso all’informativa privacy' })

export const loginSchema = z.object({
  email: zEmail,
  password: z.string().min(1, { error: 'Inserisci la password' }).max(200),
})
export type LoginInput = z.infer<typeof loginSchema>

/** A family signs up by itself (the website: "Iscrivi e partecipa con la tua famiglia"). */
export const registerFamilySchema = z.object({
  familyName: zRequiredText(120),
  firstName: zPersonName,
  lastName: zPersonName,
  /** The referent's, an adult: their card is born with it (everyone's age is required). */
  birthDate: zBirthDate.refine(day => ageOn(day) >= 18, {
    error: 'Il referente della famiglia è maggiorenne',
    // Only on a valid date: a wrong one already says so.
    when: payload => payload.issues.length === 0,
  }),
  email: zEmail,
  phone: zRequiredPhone,
  password: zPassword,
  privacy: zPrivacy,
})
export type RegisterFamilyInput = z.infer<typeof registerFamilySchema>

/**
 * A person applies to join the staff or the v-team: the account and the CV, one multipart form (`file`
 * plus these fields, so the tick arrives as the text 'true'). It reaches the administration once the
 * address is confirmed (spec 3.4).
 */
export const registerStaffSchema = z.object({
  /** The team the person applies for: the link they came from. */
  team: z.enum(STAFF_TEAMS).default('staff'),
  firstName: zPersonName,
  lastName: zPersonName,
  email: zEmail,
  phone: zRequiredPhone,
  password: zPassword,
  privacy: z.preprocess(value => (typeof value === 'string' ? value === 'true' : value), zPrivacy),
})
export type RegisterStaffInput = z.infer<typeof registerStaffSchema>

export const verifyEmailSchema = z.object({ token: zToken })

export const resendVerificationSchema = z.object({ email: zEmail })

export const forgotPasswordSchema = z.object({ email: zEmail })

export const resetPasswordSchema = z.object({ token: zToken, password: zPassword })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const acceptInviteSchema = z.object({ token: zToken, password: zPassword, privacy: zPrivacy })
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>

export const accountSchema = z.object({
  firstName: zPersonName,
  lastName: zPersonName,
  phone: zPhone.nullable().optional(),
})
export type AccountInput = z.infer<typeof accountSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { error: 'Inserisci la password attuale' }).max(200),
  newPassword: zPassword,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
