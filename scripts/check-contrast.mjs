#!/usr/bin/env node
// The colour rule of DESIGN.md, checked against app/assets/css/main.css: every text role and every
// semantic colour at 4.5:1 on the page, the muted page and the panels; input borders at 3:1; white text
// on every solid colour; a subtle badge's text on its 10% tint. Exit 1 on failure.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')
const vars = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(m => [m[1], m[2].toLowerCase()]),
)

const channel = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const rgb = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16))
const luminance = hex => {
  const [r, g, b] = rgb(hex).map(v => channel(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** `color` at `alpha` over `base`. */
const mix = (color, base, alpha) =>
  `#${rgb(color)
    .map((v, i) => Math.round(v * alpha + rgb(base)[i] * (1 - alpha)))
    .map(v => v.toString(16).padStart(2, '0'))
    .join('')}`

let checked = 0
const failures = []
const need = (label, fg, bg, min) => {
  if (!fg || !bg) {
    failures.push(`${label}: missing colour`)
    return
  }
  checked++
  const r = ratio(fg, bg)
  if (r < min) failures.push(`${label} ${r.toFixed(2)} < ${min}`)
}

const surfaces = ['ui-bg', 'ui-bg-muted', 'ui-bg-elevated']
const texts = ['ui-text-dimmed', 'ui-text-muted', 'ui-text-toned', 'ui-text', 'ui-text-highlighted']
const semantic = ['ui-primary', 'ui-secondary', 'ui-success', 'ui-info', 'ui-warning', 'ui-error']
for (const surface of surfaces) {
  for (const role of [...texts, ...semantic]) need(`${role} on ${surface}`, vars[role], vars[surface], 4.5)
  need(`ui-border-accented on ${surface}`, vars['ui-border-accented'], vars[surface], 3)
}
for (const role of semantic) {
  need(`white on solid ${role}`, vars['ui-text-inverted'], vars[role], 4.5)
  need(`${role} on its 10% tint`, vars[role], mix(vars[role], vars['ui-bg-elevated'], 0.1), 4.5)
  need(`${role} on its 10% tint over the page`, vars[role], mix(vars[role], vars['ui-bg'], 0.1), 4.5)
}
need('white on primary hover (blu-700)', vars['ui-text-inverted'], vars['color-blu-700'], 4.5)

console.log(`check-contrast: ${checked} pairs, ${failures.length} failures`)
for (const failure of failures.slice(0, 20)) console.log(`  ✗ ${failure}`)
process.exit(failures.length ? 1 : 0)
