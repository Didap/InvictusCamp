// Creates the sessions of the 2027 calendar (shared/content/calendar-2027.ts) as drafts in DATABASE_URL, with
// the defaults of the new-session form, in the name of an administrator (created_by and the audit, as the
// form does). Sessions already there are skipped (calendarPlan), so the script can run again. Without
// --apply it only says what it would do.
//
//   node --env-file-if-exists=.env scripts/create-calendar.mjs [--apply --by <email of an administrator>]
//
// Needs Node 22.18 or later (type stripping). Prints a few lines and exits 0 or 1.
import { parseArgs } from 'node:util'
import postgres from 'postgres'
import { calendarPlan, calendarTitle } from '../shared/content/calendar-2027.ts'
import { DEFAULT_FAMILY_SLOTS, DEFAULT_LOCATION, DEFAULT_STAFF_NEEDED } from '../shared/utils/constants.ts'
import { activeAdmin, failer } from './lib/admin.mjs'

const fail = failer('create-calendar')
const url = process.env.DATABASE_URL
if (!url) fail('DATABASE_URL is not set')
let args
try {
  args = parseArgs({ options: { apply: { type: 'boolean' }, by: { type: 'string' } } }).values
} catch (error) {
  fail(error.message)
}
const { apply, by } = args
if (apply && !by) fail('--apply needs --by <email of an administrator>')

const sql = postgres(url, { max: 1, onnotice: () => {} })
try {
  const { create, skipped } = await sql.begin(async tx => {
    const existing = await tx`
      select title, status, start_date::text as "startDate", end_date::text as "endDate" from camp_sessions`
    const plan = calendarPlan(existing)
    if (!apply || !plan.create.length) return plan
    const adminId = await activeAdmin(tx, by)
    const rows = await tx`insert into camp_sessions ${tx(
      plan.create.map(session => ({
        title: calendarTitle(session),
        location: DEFAULT_LOCATION,
        start_date: session.startDate,
        end_date: session.endDate,
        family_slots: DEFAULT_FAMILY_SLOTS,
        staff_needed: DEFAULT_STAFF_NEEDED,
        created_by: adminId,
      })),
    )} returning id, title`
    await tx`insert into audit_log ${tx(
      rows.map(row => ({
        actor_user_id: adminId,
        action: 'session.create',
        entity_type: 'session',
        entity_id: row.id,
        data: tx.json({ title: row.title, source: 'create-calendar' }),
      })),
    )}`
    return plan
  })
  const numbers = create.map(({ number }) => `S${number}`).join(', ') || 'none'
  console.log(`${apply ? 'created' : 'would create'} ${create.length} draft sessions: ${numbers}`)
  if (skipped.length) {
    // The title only when another session is in the way, not this one created before.
    const list = skipped.map(({ session, by }) =>
      by.title === calendarTitle(session) ? `S${session.number}` : `S${session.number} («${by.title}»)`,
    )
    console.log(`skipped, already there: ${list.join(', ')}`)
  }
  if (!apply && create.length) console.log('run again with --apply --by <email of an administrator> to write them')
} catch (error) {
  console.error(`create-calendar: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
