// Imports a year of feedback from the pages the camp published (docs/spec.md 3.13) into DATABASE_URL: the
// folder holds feedback-<year>.html, commenti-<year>.html and staff-<year>.html, saved from the pages of
// Nicola. The year is replaced whole, in the name of an administrator (audited). Without --apply it only
// says what it read.
//
//   node --env-file-if-exists=.env scripts/import-feedback.mjs <folder> [--year 2026] [--source <address>]
//     [--apply --by <email of an administrator>]
//
// Needs Node 22.18 or later (type stripping). Prints a few lines and exits 0 or 1.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import postgres from 'postgres'
import { feedbackArchiveSchema, feedbackYearParamsSchema } from '../shared/schemas/feedback.ts'
import { respondents } from '../shared/utils/feedback.ts'
import { activeAdmin, failer } from './lib/admin.mjs'
import { parseFeedbackPages } from './lib/feedback-pages.ts'

const fail = failer('import-feedback')
let args
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      year: { type: 'string', default: '2026' },
      source: { type: 'string' },
      apply: { type: 'boolean' },
      by: { type: 'string' },
    },
  })
} catch (error) {
  fail(error.message)
}
const { values, positionals } = args
const [folder] = positionals
const year = feedbackYearParamsSchema.shape.year.safeParse(values.year).data
if (!folder) fail('name the folder with the saved pages')
if (year === undefined) fail('--year needs a year the page can open (2000-2100)')
if (values.apply && !values.by) fail('--apply needs --by <email of an administrator>')

let archive
try {
  const page = name => readFileSync(join(folder, `${name}-${year}.html`), 'utf8')
  const parsed = feedbackArchiveSchema.safeParse(
    parseFeedbackPages({ feedback: page('feedback'), comments: page('commenti'), staff: page('staff') }),
  )
  const issue = parsed.error?.issues[0]
  if (issue) fail(`the pages do not have the expected shape at ${issue.path.join('.') || 'the top'}: ${issue.message}`)
  archive = parsed.data
} catch (error) {
  fail(error.message)
}

const { staff } = archive
console.log(
  `${year}: ${archive.sessions.length} sessions, ${respondents(archive, null)} families, ` +
    `${archive.votes.length} votes on ${archive.items.length} items, ${archive.themes.length} themes, ` +
    `${archive.comments.items.length} comments, ${staff.people.length} staff, ${staff.turns.length} led turns`,
)
if (!values.apply) {
  console.log('run again with --apply --by <email of an administrator> to write it')
  process.exit(0)
}

const url = process.env.DATABASE_URL
if (!url) fail('DATABASE_URL is not set')
const sql = postgres(url, { max: 1, onnotice: () => {} })
try {
  const replaced = await sql.begin(async tx => {
    const adminId = await activeAdmin(tx, values.by)
    // A year is read from its archive or from the questionnaire, never both (docs/spec.md 3.13).
    const [answered] = await tx`
      select 1 from feedback_responses r join camp_sessions s on s.id = r.session_id
      where extract(year from s.start_date)::int = ${year} limit 1`
    if (answered) throw new Error(`the families answered the questionnaire in ${year}: an archive would hide it`)
    const [before] = await tx`select 1 from feedback_archives where year = ${year}`
    await tx`
      insert into feedback_archives (year, data, source, imported_by, imported_at)
      values (${year}, ${tx.json(archive)}, ${values.source ?? null}, ${adminId}, now())
      on conflict (year) do update
      set data = excluded.data, source = excluded.source, imported_by = excluded.imported_by, imported_at = now()`
    await tx`insert into audit_log ${tx({
      actor_user_id: adminId,
      action: 'feedback.import',
      entity_type: 'feedback_archive',
      data: tx.json({ year, source: values.source ?? null, replaced: !!before }),
    })}`
    return !!before
  })
  console.log(`${replaced ? 'replaced' : 'imported'} the feedback of ${year}`)
} catch (error) {
  console.error(`import-feedback: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
