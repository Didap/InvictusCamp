// Shared by page-check.mjs and check-pages.mjs: a signed-in headless Chromium against the dev server, or the
// deployed app named by INVICTUS_BASE_URL.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

export const BASE = (process.env.INVICTUS_BASE_URL ?? 'http://localhost:3080').replace(/\/$/, '')
/** A dev server on this machine: demo data, /api/dev/ids, `pnpm db:seed`. Anything else is a deployed app. */
export const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)
export const PASSWORD = 'invictus-demo'
export const ACCOUNTS = {
  admin: 'admin@invictuscamp.local',
  famiglia: 'famiglia@invictuscamp.local',
  staff: 'staff@invictuscamp.local',
  candidato: 'candidato@invictuscamp.local',
  nuova: 'nuova@invictuscamp.local',
}

export function launch() {
  return chromium.launch()
}

export function newContext(browser, { mobile = false } = {}) {
  return browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
  })
}

/**
 * Signs the context in as a demo account ('guest' stays signed out), or as any account given by its email
 * with the password in INVICTUS_PASSWORD (a deployed app has no demo admin). The cookie is saved in
 * .checks/auth, one file per server and account, and reused while the server still accepts it, so repeated
 * checks stay under the sign-in rate limit (8 a person every 5 minutes, the real person's own included).
 */
export async function signIn(context, who) {
  if (who === 'guest') return
  // The server keeps emails lowercased: the same here, or the saved cookie would never match.
  const email = who.includes('@') ? who.trim().toLowerCase() : ACCOUNTS[who]
  if (!email) throw new Error(`unknown account "${who}" (${Object.keys(ACCOUNTS).join(', ')}, guest, or an email)`)
  const demo = Object.values(ACCOUNTS).includes(email)
  const saved = resolve(`.checks/auth/${new URL(BASE).host.replace(':', '-')}-${email}.json`)
  if (existsSync(saved)) {
    await context.addCookies(JSON.parse(readFileSync(saved, 'utf8')))
    const account = await context.request.get(`${BASE}/api/account`)
    if (account.ok() && (await account.json()).email === email) return
    await context.clearCookies()
  }
  const password = demo ? PASSWORD : process.env.INVICTUS_PASSWORD
  if (!password) throw new Error(`INVICTUS_PASSWORD is not set for ${email}`)
  const response = await context.request.post(`${BASE}/api/auth/login`, { data: { email, password } })
  if (!response.ok()) {
    // The server's message already says what went wrong (wrong password, disabled, too many attempts).
    const { message = '' } = await response.json().catch(() => ({}))
    const hint = !demo ? 'check INVICTUS_PASSWORD' : LOCAL ? 'seed the dev database (pnpm db:seed)' : 'use --as <email>'
    throw new Error(`login ${email} failed (${response.status()} ${message}): ${hint}`)
  }
  mkdirSync(dirname(saved), { recursive: true })
  writeFileSync(saved, JSON.stringify(await context.cookies()), { mode: 0o600 })
}

/** Where fill:<selector>=<text> splits: the first '=' outside [attribute] brackets and quotes. */
function fillSplit(arg) {
  let depth = 0
  let quote = null
  for (let i = 0; i < arg.length; i++) {
    const c = arg[i]
    if (quote) quote = c === quote ? null : quote
    else if (c === '"' || c === "'") quote = c
    else if (c === '[') depth++
    else if (c === ']') depth--
    else if (c === '=' && depth === 0) return i
  }
  return -1
}

/** Replaces {session}, {family}, {signature}… with ids from GET /api/dev/ids (dev only). */
export async function resolvePath(context, path) {
  if (!/\{[a-zA-Z]+\}/.test(path)) return path
  const response = await context.request.get(`${BASE}/api/dev/ids`)
  if (response.status() === 404)
    throw new Error('{tokens} need the dev server (no /api/dev/ids here): put the ids in the path')
  if (!response.ok()) throw new Error(`GET /api/dev/ids failed (${response.status()})`)
  const ids = await response.json()
  return path.replace(/\{([a-zA-Z]+)\}/g, (_, key) => {
    if (!ids[key]) throw new Error(`no id for {${key}} for this account`)
    return ids[key]
  })
}

/**
 * Opens `path`, runs the actions, takes the screenshot, and returns what went wrong: console errors,
 * uncaught exceptions, failed or 4xx/5xx requests to the app, the 404 page, an unexpected redirect.
 */
export async function visit(context, path, { actions = [], wait = 400, shot, full = false } = {}) {
  const page = await context.newPage()
  const problems = []
  const warnings = []
  page.on('console', message => {
    const text = message.text()
    if (message.type() === 'error') problems.push(`console: ${text}`)
    else if (message.type() === 'warning' && /\[Vue warn\]|hydration|\[nuxt\]/i.test(text)) warnings.push(text)
  })
  page.on('pageerror', error => problems.push(`uncaught: ${error.message}`))
  page.on('response', response => {
    const url = response.url()
    if (response.status() >= 400 && url.startsWith(BASE) && !url.includes('/__nuxt') && !url.endsWith('favicon.ico')) {
      problems.push(`http ${response.status()}: ${response.request().method()} ${url.slice(BASE.length)}`)
    }
  })
  page.on('requestfailed', request => {
    const url = request.url()
    const reason = request.failure()?.errorText ?? ''
    if (url.startsWith(BASE) && !/ERR_ABORTED/.test(reason))
      problems.push(`request failed: ${request.method()} ${url.slice(BASE.length)} ${reason}`)
  })

  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45_000 })
  await page.waitForTimeout(wait)
  for (const action of actions) {
    const [verb, ...rest] = action.split(':')
    const arg = rest.join(':')
    try {
      if (verb === 'click') await page.locator(arg).first().click({ timeout: 5000 })
      else if (verb === 'hover') await page.locator(arg).first().hover({ timeout: 5000 })
      else if (verb === 'fill') {
        const eq = fillSplit(arg)
        await page
          .locator(arg.slice(0, eq))
          .first()
          .fill(arg.slice(eq + 1), { timeout: 5000 })
      } else if (verb === 'type') await page.keyboard.type(arg, { delay: 15 })
      else if (verb === 'press') await page.keyboard.press(arg)
      else if (verb === 'wait') await page.waitForTimeout(Number(arg))
      else if (verb === 'waitfor') await page.locator(arg).first().waitFor({ timeout: 8000 })
      else if (verb === 'goto') await page.goto(`${BASE}${arg}`, { waitUntil: 'networkidle' })
      else problems.push(`unknown action ${action}`)
      await page.waitForTimeout(250)
    } catch (error) {
      problems.push(`action ${action} failed: ${error.message.split('\n')[0]}`)
    }
  }
  await page.waitForLoadState('networkidle').catch(() => {})

  const finalPath = new URL(page.url()).pathname
  const h1 = (
    (await page
      .locator('h1')
      .first()
      .textContent({ timeout: 2000 })
      .catch(() => '')) ?? ''
  ).trim()
  if (/^Pagina non trovata$/.test(h1)) problems.push('the page does not exist (404)')
  if (finalPath === '/accedi' && !path.startsWith('/accedi')) problems.push('redirected to /accedi')

  if (shot) {
    mkdirSync(dirname(resolve(shot)), { recursive: true })
    await page.screenshot({ path: resolve(shot), fullPage: full })
  }
  await page.close()
  return { problems: [...new Set(problems)], warnings: [...new Set(warnings)], h1, finalPath }
}

export function slugOf(path) {
  return (
    path
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'root'
  )
}
