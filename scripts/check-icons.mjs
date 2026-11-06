#!/usr/bin/env node
// Every i-lucide-* icon named in app/ and shared/ exists in @iconify-json/lucide. Exit 1 otherwise.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const lucide = JSON.parse(readFileSync(require.resolve('@iconify-json/lucide/icons.json'), 'utf8'))
const known = new Set([...Object.keys(lucide.icons), ...Object.keys(lucide.aliases ?? {})])

const root = new URL('..', import.meta.url).pathname
const files = []
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(vue|ts)$/.test(name)) files.push(path)
  }
}
for (const dir of ['app', 'shared']) walk(join(root, dir))

const missing = new Map()
let used = 0
for (const file of files) {
  for (const [, name] of readFileSync(file, 'utf8').matchAll(/i-lucide-([a-z0-9-]+)/g)) {
    used++
    if (!known.has(name)) missing.set(name, file.slice(root.length))
  }
}
console.log(`check-icons: ${used} uses, ${missing.size} missing`)
for (const [name, file] of [...missing].slice(0, 20)) console.log(`  ✗ i-lucide-${name} (${file})`)
process.exit(missing.size ? 1 : 0)
