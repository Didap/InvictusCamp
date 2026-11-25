// The guide of each role (docs/spec.md 3.15): the texts follow the voice of DESIGN.md and point at the role's pages.
import { describe, expect, it } from 'vitest'
import { GUIDES } from '#shared/content/guide'
import { ROLE_HOME } from '#shared/utils/routes'
import type { UserRole } from '#shared/utils/constants'

const roles = Object.keys(GUIDES) as UserRole[]

function texts(role: UserRole): string[] {
  const guide = GUIDES[role]
  return [
    guide.intro,
    ...Object.values(guide.areas),
    ...guide.howTos.flatMap(howTo => [howTo.title, ...howTo.steps]),
    ...guide.faqs.flatMap(faq => [faq.question, faq.answer]),
  ]
}

describe('guide', () => {
  it.each(roles)('%s: no em dashes, no exclamation marks, no straight apostrophes', role => {
    for (const text of texts(role)) {
      expect(text).not.toMatch(/[—!']/)
    }
  })

  it.each(roles)('%s: describes only pages of its own area', role => {
    for (const path of Object.keys(GUIDES[role].areas)) {
      expect(path === ROLE_HOME[role] || path.startsWith(`${ROLE_HOME[role]}/`)).toBe(true)
    }
  })

  it.each(roles)('%s: has steps and questions, every step and answer a sentence', role => {
    const { howTos, faqs } = GUIDES[role]
    expect(howTos.length).toBeGreaterThan(0)
    expect(faqs.length).toBeGreaterThan(0)
    for (const step of [...howTos.flatMap(howTo => howTo.steps), ...faqs.map(faq => faq.answer)]) {
      expect(step).toMatch(/[.?»]$/)
    }
  })
})
