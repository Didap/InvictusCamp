/** What a template needs besides its own data. */
export interface EmailContext {
  /** Public address of the app, for links. */
  appUrl: string
}

/** A rendered email, ready for deliver() (server/utils/email.ts). Domain functions return these. */
export interface EmailMessage {
  to: string
  toUserId?: string | null
  /** Template key recorded in email_log, e.g. 'auth.invite', 'session.invite'. */
  template: string
  subject: string
  html: string
  text: string
  sessionId?: string | null
  communicationId?: string | null
  /** Carries an access link or a code: its HTML is not kept in email_log. */
  sensitive?: boolean
  /** Printed in the dev console when the email is simulated (the link or code of an access email). */
  devNote?: string
}
