import { familyProgramme, programmePdf } from '#server/domain/programmes'

/** The programme the family reads, as a PDF opened in the browser to print or keep. */
export default defineEventHandler(async event => {
  const { family } = await requireFamily(event)
  const view = await familyProgramme(useDb(), {
    familyId: family.id,
    sessionId: requireUuidParam(event, 'sessionId'),
  })
  return sendPdf(event, await programmePdf(view), { download: false })
})
