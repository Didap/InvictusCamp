// The guide of each role (docs/spec.md 3.15): the texts follow the voice of DESIGN.md and describe the role's menu.
import { describe, expect, it } from 'vitest'
import { GUIDES } from '#shared/content/guide'
import { guidePages, navFor } from '#shared/utils/nav'
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

  it.each(roles)('%s: describes every page of its menu and the account, nothing else', role => {
    const pages = guidePages(navFor(role, true)).map(item => item.to)
    expect(Object.keys(GUIDES[role].areas).sort()).toEqual(pages.sort())
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
