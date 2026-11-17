import { programmePdf, sessionProgrammeForFamilies } from '#server/domain/programmes'

/** The programme of the session as its families read it, a PDF opened in the browser to print and hand out. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const view = await sessionProgrammeForFamilies(useDb(), requireUuidParam(event, 'id'))
  return sendPdf(event, await programmePdf(view), { download: false })
})
