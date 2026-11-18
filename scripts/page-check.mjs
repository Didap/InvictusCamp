#!/usr/bin/env node
// Opens one page of the running dev server (or INVICTUS_BASE_URL) in headless Chromium, signed in as a demo
// or a real account, and reports what went wrong. Prints a few lines and exits 1 when the page has errors.
//
//   node scripts/page-check.mjs <path> [options]
//
// <path> tokens (GET /api/dev/ids): {session} {sessionDraft} {sessionPast} {family} {staff} {candidate} {volunteer}
//   {document} {communication} {signature} (a pending signature of the signed-in account)
// A deployed app has no demo admin and no tokens: sign in with a real account and put the ids in the path,
// with INVICTUS_BASE_URL and INVICTUS_PASSWORD in a git-ignored file (the cookie stays in .checks/auth):
//   node --env-file=.env.prod scripts/page-check.mjs /admin/famiglie --as <email>
// There the screenshot is taken only with --shot: real pages can show health data.
// Options:
//   --as <who>       admin (default), famiglia, staff, candidato, guest (signed out), or an account's email
//   --mobile         390x844, touch (default desktop 1280x800)
//   --shot <file>    screenshot path (default .checks/<who>-<slug>-<viewport>.png on the dev server)
//   --full           full-page screenshot        --no-shot   skip it
//   --wait <ms>      extra wait after load (default 400)
//   --action <a>     repeatable, in order: click:<sel> fill:<sel>=<text> press:<key> hover:<sel>
//                    wait:<ms> waitfor:<sel> type:<text> goto:<path>
import { LOCAL, launch, newContext, resolvePath, signIn, slugOf, visit } from './lib/browser.mjs'

const args = process.argv.slice(2)
const VALUE_OPTIONS = ['--as', '--shot', '--wait', '--action']
const flag = name => args.includes(`--${name}`)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const options = name => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] !== undefined ? [args[i + 1]] : []))
const rawPath = args.find((a, i) => !a.startsWith('--') && !VALUE_OPTIONS.includes(args[i - 1]))
if (!rawPath) {
  console.error('page-check: missing <path>')
  process.exit(2)
}

const who = option('as', 'admin')
const mobile = flag('mobile')
const browser = await launch()
let code = 0
try {
  const context = await newContext(browser, { mobile })
  await signIn(context, who)
  const path = await resolvePath(context, rawPath)
  const shot = flag('no-shot')
    ? undefined
    : option('shot', LOCAL ? `.checks/${who}-${slugOf(rawPath)}-${mobile ? 'mobile' : 'desktop'}.png` : undefined)
  const result = await visit(context, path, {
    actions: options('action'),
    wait: Number(option('wait', '400')),
    shot,
    full: flag('full'),
  })
  console.log(
    `page-check: ${path} as ${who} ${mobile ? 'mobile' : 'desktop'} errors=${result.problems.length} warnings=${result.warnings.length} h1="${result.h1}"${shot ? ` shot=${shot}` : ''}`,
  )
  for (const problem of result.problems.slice(0, 12)) console.log(`  ✗ ${problem.slice(0, 300)}`)
  for (const warning of result.warnings.slice(0, 6)) console.log(`  ! ${warning.slice(0, 300)}`)
  if (result.problems.length) code = 1
} catch (error) {
  console.log(`page-check: ${rawPath} failed: ${error.message.split('\n')[0]}`)
  code = 1
} finally {
  await browser.close()
}
process.exit(code)
