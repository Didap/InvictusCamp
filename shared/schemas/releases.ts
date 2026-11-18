import { z } from 'zod'
import { RELEASE_TEXT_MAX, releaseFieldIssue } from '../content/release'
import { zRequiredText } from './common'

const zRevision = z.number().int().min(0)

/** PUT /api/admin/release-text: the text, with the revision it was loaded at. */
export const releaseTextSaveSchema = z.object({
  revision: zRevision,
  body: zRequiredText(RELEASE_TEXT_MAX).superRefine((body, ctx) => {
    const issue = releaseFieldIssue(body)
    if (issue) ctx.addIssue({ code: 'custom', message: issue })
  }),
})
export type ReleaseTextSaveInput = z.input<typeof releaseTextSaveSchema>
export type ReleaseTextSaveValues = z.output<typeof releaseTextSaveSchema>

/** POST /api/admin/release-text/renew: the revision of the text the administration is looking at. */
export const releaseRenewSchema = z.object({ revision: zRevision })
