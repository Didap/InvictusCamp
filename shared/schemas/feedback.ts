// The shape of a feedback year (shared/types/feedback.ts), checked before an import writes it.
// Runtime imports: zod only, so scripts/import-feedback.mjs can load this file with Node's type stripping.
import { z } from 'zod'
import type { FeedbackArchive } from '../types/feedback'

/** GET /api/admin/feedback/[year]. */
export const feedbackYearParamsSchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) })

const count = z.number().int().min(0)
const session = z.number().int().min(1)
const text = z.string().trim().min(1)

export const feedbackArchiveSchema: z.ZodType<FeedbackArchive> = z
  .object({
    sessions: z.array(z.object({ number: session, respondents: count })).min(1),
    items: z.array(z.object({ label: text, kind: z.enum(['activity', 'other']) })).min(1),
    votes: z.array(z.tuple([session, count, z.number().int().min(1).max(5)])),
    themes: z.array(z.object({ title: text, families: count, sessions: z.array(session), detail: z.string() })),
    comments: z.object({
      questions: z.array(text),
      items: z.array(z.object({ session, family: count, question: count, text })),
    }),
    staff: z.object({
      note: z.string().nullable(),
      people: z.array(
        z.object({
          name: text,
          sessions: z.array(session),
          leads: z.array(
            z.object({
              session,
              activity: text,
              votes: z.object({ five: count, four: count, low: count }),
              note: z.string().nullable(),
            }),
          ),
        }),
      ),
    }),
  })
  .superRefine((archive, ctx) => {
    const numbers = new Set(archive.sessions.map(s => s.number))
    const known = (n: number) => numbers.has(n)
    if (archive.votes.some(([s, item]) => !known(s) || item >= archive.items.length))
      ctx.addIssue({ code: 'custom', message: 'A vote names a session or an item that is not there' })
    if (archive.comments.items.some(c => !known(c.session) || c.question >= archive.comments.questions.length))
      ctx.addIssue({ code: 'custom', message: 'A comment names a session or a question that is not there' })
    if (archive.staff.people.some(p => !p.sessions.every(known) || !p.leads.every(l => known(l.session))))
      ctx.addIssue({ code: 'custom', message: 'A person of the staff names a session that is not there' })
  })
