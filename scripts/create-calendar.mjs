// Creates the sessions of the 2027 calendar (shared/content/calendar-2027.ts) as drafts in DATABASE_URL, with
// the defaults of the new-session form. A session whose dates overlap one already there (not cancelled) is
// skipped, so the script can run again. Without --apply it only says what it would do.
//
//   node --env-file-if-exists=.env scripts/create-calendar.mjs [--apply]
//
// Prints a few lines and exits 0 or 1.
import postgres from 'postgres'
import { CALENDAR_2027, calendarTitle } from '../shared/content/calendar-2027.ts'
import { DEFAULT_LOCATION } from '../shared/utils/constants.ts'

const FAMILY_SLOTS = 8
const STAFF_NEEDED = 10

const url = process.env.DATABASE_URL
if (!url) {
  console.error('create-calendar: DATABASE_URL is not set')
  process.exit(1)
}
const apply = process.argv.includes('--apply')
const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  const result = await sql.begin(async tx => {
    const create = []
    const skipped = []
    for (const session of CALENDAR_2027) {
      const [taken] = await tx`
        select title from camp_sessions
        where status <> 'cancelled' and start_date <= ${session.endDate} and end_date >= ${session.startDate}
        limit 1`
      if (!taken) create.push(session)
      // The title only when another session is in the way, not this one created before.
      else
        skipped.push(
          taken.title === calendarTitle(session) ? `S${session.number}` : `S${session.number} («${taken.title}»)`,
        )
    }
    if (apply && create.length) {
      await tx`insert into camp_sessions ${tx(
        create.map(session => ({
          title: calendarTitle(session),
          location: DEFAULT_LOCATION,
          start_date: session.startDate,
          end_date: session.endDate,
          family_slots: FAMILY_SLOTS,
          staff_needed: STAFF_NEEDED,
        })),
      )}`
    }
    return { create, skipped }
  })
  const numbers = result.create.map(session => `S${session.number}`).join(', ') || 'none'
  console.log(`${apply ? 'created' : 'would create'} ${result.create.length} draft sessions: ${numbers}`)
  if (result.skipped.length) console.log(`skipped, dates already taken: ${result.skipped.join(', ')}`)
  if (!apply && result.create.length) console.log('run again with --apply to write them')
} catch (error) {
  console.error(`create-calendar: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
