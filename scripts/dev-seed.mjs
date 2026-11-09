#!/usr/bin/env node
// Fills the development database with demo data through the running dev server (POST /api/dev/seed).
//   node scripts/dev-seed.mjs [--fresh]   --fresh empties every table first
// Accounts: admin@ famiglia@ staff@ candidato@ invictuscamp.local, password invictus-demo.
const base = (process.env.INVICTUS_BASE_URL ?? 'http://localhost:3080').replace(/\/$/, '')
const fresh = process.argv.includes('--fresh')
try {
  const response = await fetch(`${base}/api/dev/seed${fresh ? '?fresh' : ''}`, { method: 'POST' })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message ?? response.statusText)
  console.log(
    body.seeded
      ? `dev-seed: ${body.users} users, ${body.families} families, ${body.staff} staff, ${body.sessions} sessions, ${body.documents} documents (password ${body.password})`
      : `dev-seed: ${body.message}`,
  )
} catch (error) {
  console.log(`dev-seed: failed (${error.message}). Is the dev server running on ${base}?`)
  process.exit(1)
}
