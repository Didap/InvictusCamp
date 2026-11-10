# Product

## Register

product

The gestionale is a working tool: lists, records, forms, a dashboard. The public pages (sign-in, family
registration, staff application, password, invitation) are the only surfaces in the brand register, and
they stay sober too.

## Users

Three populations share one app; the shell, the pages and the language change with the role.

**The administration (admin).** The few people who organise Invictus Camp. In spring they plan the summer
sessions, pick families into the places of each session and keep reserves ready, review staff applications,
convoke staff by availability, collect signed documents and write to everyone. Desktop, long sessions, many
records. They need the state of every session at a glance and actions that are safe to repeat.

**Families.** The referent of a family with a child or a teenager with a chronic or genetic condition or a
disability: a parent or a guardian, often tired, sometimes on a phone in a waiting room. They register,
describe the members of the family and their needs, upload documents, answer an invitation, sign the
regulation and the consents. Rare visits, high stakes: they must never feel judged, rushed or lost.
Mostly on a phone.

**Staff.** Group leads (responsabili di gruppo) and activity leads (responsabili attività); the roles are symbolic for now. They apply, wait for
the review, give the periods they are available, accept or decline a convocation, sign the contract.
Phone first.

## Product Purpose

Run the camp season from one place: sessions (dates, places, reserves), the families invited into them, the
staff convoked, the documents signed, the messages sent. It replaces spreadsheets, chat threads and paper
forms with records whose state is always visible and emails that are always recorded.

Success: for every session the administration knows who is coming, who is waiting, who still has to sign
and who to call next; families and staff always know what is asked of them and by when.

## Brand Personality

Warm, capable, calm. The identity of the camp (the cream of its pages, the blue, yellow and red mark, the
rainbow wordmark) carried with restraint: a professional tool for a joyful place. Plain Italian, the "tu"
form, short sentences, no exclamation marks, no jargon toward families.

## Anti-references

- The landing page look inside the tool: big photos, pill buttons in every colour, display type.
- Generic SaaS dashboards: gradients, glass, purple hero cards, emoji, vanity charts.
- Clinical software: cold greys, codes, medical jargon addressed to families.
- Charity pity: disability as tragedy, sad imagery, "special" or "brave" language.

## Design Principles

1. **State first.** Every record shows its status as icon and label, and the next action is obvious.
2. **One primary action per view.** Actions that send emails or remove something confirm first and say
   what will happen ("Partiranno 6 email").
3. **Respect the person.** People-first language ("persona con disabilità"); health details only where
   they are needed, marked as reserved.
4. **Calm density where it helps.** Tables and filters for the administration on desktop; generous
   spacing, one question at a time and large targets for families and staff on phones.
5. **Nothing silent.** Every automatic email is in the log; every change of a session's status says what
   it sends before it sends it.

## Accessibility & Inclusion

WCAG 2.2 AA at least. Atkinson Hyperlegible Next, designed for readers with low vision, is the only face;
body text is 16px. Contrast is verified by `scripts/check-contrast.mjs`. Colour is never the only signal.
Focus is always visible; touch targets are at least 44px; everything works with the keyboard; reduced
motion is respected. Forms have visible labels, help in words and errors that say how to fix them.
Italian copy for families aims at plain language (about level B1).

Health and disability details are special category data (GDPR art. 9): collected only after an explicit
consent, visible only to the family and to the administration, never in emails, changes recorded in the
audit log.
