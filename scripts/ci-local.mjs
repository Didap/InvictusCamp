#!/usr/bin/env node
// The local CI: format, types, unit tests, database tests, build. One line per step, exit 1 when any
// step is red. The database tests need the Postgres of docker-compose (pnpm db:up).
//
//   node scripts/ci-local.mjs                 every step
//   node scripts/ci-local.mjs types tests     only those (format, types, unit, db, build, icons, contrast)
import { spawnSync } from 'node:child_process'

const STEPS = {
  format: ['pnpm', ['exec', 'prettier', '--check', '.']],
  types: ['pnpm', ['exec', 'vue-tsc', '-b', '--noEmit']],
  icons: ['node', ['scripts/check-icons.mjs']],
  contrast: ['node', ['scripts/check-contrast.mjs']],
  unit: ['pnpm', ['exec', 'vitest', 'run', '--project', 'unit']],
  db: ['pnpm', ['exec', 'vitest', 'run', '--project', 'db']],
  build: ['pnpm', ['exec', 'nuxt', 'build']],
}

const wanted = process.argv.slice(2).filter(step => step in STEPS)
const steps = wanted.length ? wanted : Object.keys(STEPS)
let red = 0
for (const step of steps) {
  const [command, args] = STEPS[step]
  const started = Date.now()
  const run = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    maxBuffer: 64 * 1024 * 1024,
  })
  const seconds = ((Date.now() - started) / 1000).toFixed(0)
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  if (run.status === 0) {
    console.log(`PASS ${step} (${seconds}s)`)
    continue
  }
  red++
  console.log(`FAIL ${step} (${seconds}s)`)
  const lines = output
    .split('\n')
    .filter(line => /error|fail|✗|\[warn\]|×/i.test(line))
    .slice(0, 8)
  for (const line of lines.length ? lines : output.trim().split('\n').slice(-8)) console.log(`  ${line.slice(0, 220)}`)
}
process.exit(red ? 1 : 0)
