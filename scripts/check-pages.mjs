#!/usr/bin/env node
// Opens every page of every role, desktop and phone, in one headless Chromium. One line per page with
// problems, then a summary; screenshots in .checks/pages/. Exit 1 when any page has errors.
//
//   node scripts/check-pages.mjs [--only admin|famiglia|staff|candidato|guest] [--desktop|--mobile]
import { BASE, LOCAL, launch, newContext, resolvePath, signIn, slugOf, visit } from './lib/browser.mjs'

export const PAGES = {
  guest: ['/accedi', '/registrati', '/candidati', '/password-dimenticata', '/privacy'],
  admin: [
    '/admin',
    '/admin/sessioni',
    '/admin/sessioni/nuova',
    '/admin/sessioni/{session}',
    '/admin/programma',
    '/admin/programma/2027',
    '/admin/alloggi',
    '/admin/feedback',
    '/admin/feedback?vista=commenti',
    '/admin/feedback?vista=staff',
    '/admin/famiglie',
    '/admin/famiglie/{family}',
    '/admin/famiglie/modulo',
    '/admin/famiglie/liberatoria',
    '/admin/staff',
    '/admin/staff/{staff}',
    '/admin/staff/{candidate}',
    '/admin/v-team',
    '/admin/v-team/{volunteer}',
    '/admin/documenti',
    '/admin/documenti/{document}',
    '/admin/comunicazioni',
    '/admin/comunicazioni/nuova',
    '/admin/comunicazioni/{communication}',
    '/admin/utenti',
    '/account',
    '/guida',
  ],
  famiglia: [
    '/famiglia',
    '/famiglia/sessioni',
    '/famiglia/programma/{session}',
    '/famiglia/questionario/{sessionPast}',
    '/famiglia/profilo',
    '/famiglia/membri',
    '/famiglia/documenti',
    '/firma/{signature}',
    '/guida',
  ],
  staff: [
    '/staff',
    '/staff/scheda',
    '/staff/disponibilita',
    '/staff/convocazioni',
    '/staff/sessioni',
    '/staff/programma/{sessionPast}',
    '/staff/documenti',
    '/firma/{signature}',
    '/guida',
  ],
  // Before the approval the area is the home alone: the other pages lead back there.
  candidato: ['/staff', '/guida'],
}

if (!LOCAL) {
  console.log(`check-pages: dev server only (demo accounts and ids); for ${BASE} use page-check.mjs --as <email>`)
  process.exit(2)
}

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const viewports = args.includes('--desktop') ? [false] : args.includes('--mobile') ? [true] : [false, true]

const browser = await launch()
let checked = 0
let failed = 0
try {
  for (const [who, paths] of Object.entries(PAGES)) {
    if (only && who !== only) continue
    for (const mobile of viewports) {
      const context = await newContext(browser, { mobile })
      await signIn(context, who)
      for (const raw of paths) {
        checked++
        try {
          const path = await resolvePath(context, raw)
          const shot = `.checks/pages/${who}-${slugOf(raw)}-${mobile ? 'mobile' : 'desktop'}.png`
          const result = await visit(context, path, { shot })
          if (result.problems.length) {
            failed++
            console.log(
              `✗ ${who} ${mobile ? 'mobile ' : 'desktop'} ${raw}: ${result.problems[0].slice(0, 200)}${result.problems.length > 1 ? ` (+${result.problems.length - 1})` : ''}`,
            )
          }
        } catch (error) {
          failed++
          console.log(`✗ ${who} ${mobile ? 'mobile ' : 'desktop'} ${raw}: ${error.message.split('\n')[0]}`)
        }
      }
      await context.close()
    }
  }
} finally {
  await browser.close()
}
console.log(`check-pages: ${checked} pages, ${failed} with errors (screenshots in .checks/pages)`)
process.exit(failed ? 1 : 0)
