import type { AutomaticEmailKey, EmailTexts } from '../utils/automatic-emails'
import type { DeliveryReport } from './communications'

/** GET /api/admin/automatic-emails: what the administration changed of each email (the rest is the catalog). */
export interface AutomaticEmailState {
  key: AutomaticEmailKey
  /** Its event sends it. Always true for an email that cannot be switched off. */
  active: boolean
  /** Its texts are not the defaults. */
  customized: boolean
  updatedAt: string | null
  updatedByName: string | null
}

/** GET /api/admin/automatic-emails/:key */
export interface AutomaticEmailDetail extends AutomaticEmailState {
  /** The texts it leaves with now. */
  texts: EmailTexts
}

/** POST /api/admin/automatic-emails/:key/send */
export interface ManualSendResult extends DeliveryReport {
  recipients: number
}
