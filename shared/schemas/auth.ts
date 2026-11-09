import { z } from 'zod'
import { zEmail, zPassword, zPersonName, zPhone, zRequiredText, zToken } from './common'

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
  email: zEmail,
  phone: zPhone.optional(),
  password: zPassword,
  privacy: zPrivacy,
})
export type RegisterFamilyInput = z.infer<typeof registerFamilySchema>

/** A person applies to join the staff: the account first, the application inside the platform. */
export const registerStaffSchema = z.object({
  firstName: zPersonName,
  lastName: zPersonName,
  email: zEmail,
  phone: zPhone.optional(),
  password: zPassword,
  privacy: zPrivacy,
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
