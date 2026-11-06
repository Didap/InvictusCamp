---
name: Invictus Camp · Gestionale
description: A calm, professional working tool in the colours of Invictus Camp. Cream pages, white panels, one blue for action, the rainbow kept for the brand.
colors:
  page: "#fcf9ef"
  page-muted: "#f5f0e2"
  panel: "#ffffff"
  border: "#e6dfcd"
  border-accented: "#877e68"
  text: "#2f2b24"
  text-highlighted: "#1a1814"
  text-muted: "#5b5446"
  text-dimmed: "#6a6352"
  primary: "#1d5fb0"
  primary-hover: "#1a4e8e"
  secondary: "#662483"
  success: "#006227"
  info: "#135a87"
  warning: "#8f5b00"
  error: "#c80000"
  brand-mark-blue: "#1d89c7"
  brand-mark-yellow: "#fcbc50"
  brand-mark-red: "#cb333a"
  wordmark: ["#e30613", "#e94e1b", "#f39200", "#f9b233", "#008d36", "#1d71b8", "#662483"]
typography:
  family: "Atkinson Hyperlegible Next"
  mono: "Atkinson Hyperlegible Mono"
  body: "16px / 1.55"
radius: "0.25rem (panels rounded-lg, 8px)"
---

# Design System: Invictus Camp · Gestionale

## 1. Overview

The website of Invictus Camp is joyful: a cream page, a blue, yellow and red mark, a wordmark in seven
colours, pill buttons in every colour. The gestionale keeps that identity and gives it the calm of a
working tool. The cream stays as the page, panels are white, a single blue carries every action, and the
rainbow appears only where the brand speaks (the logo, the stripe on the sign-in page).

Tokens live in `app/assets/css/main.css` (scales and semantic variables) and `app/app.config.ts` (Nuxt UI
mapping). Components use Nuxt UI semantic classes (`text-muted`, `bg-elevated`, `border-default`,
`text-primary`...), never raw colours. Light theme only.

## 2. Colors

| Role | Token | Value | Use |
|---|---|---|---|
| Page | `--ui-bg` | `#fcf9ef` | The site's cream: the background of every page |
| Muted page | `--ui-bg-muted` | `#f5f0e2` | Days outside the month, quiet blocks |
| Panel | `--ui-bg-elevated` | `#ffffff` | Sidebar, tables, cards, modals |
| Primary (blu) | `--ui-primary` | `#1d5fb0` | Actions, links, the current section |
| Secondary (viola) | `--ui-secondary` | `#662483` | Rare accents (completed sessions, family role) |
| Success (verde) | `--ui-success` | `#006227` | Confirmed, signed, approved |
| Info (azzurro) | `--ui-info` | `#135a87` | Invited, sent, waiting for an answer |
| Warning (giallo) | `--ui-warning` | `#8f5b00` | To sign, to complete, declined |
| Error (rosso) | `--ui-error` | `#c80000` | Cancelled, rejected, failures |

Scales (50 to 950) are named after the brand: `blu` (site `#2373d4`), `sabbia` (neutral from the cream),
`verde` (`#008d36`), `rosso` (`#c80000`), `giallo` (`#f3b200`), `viola` (`#662483`), `azzurro` (logo
`#1d89c7`). Semantic colours sit one or two steps darker than the brand swatch so that text passes 4.5:1
on cream.

**The Verified Rule.** Every text role and every semantic colour reaches 4.5:1 on the page, the muted page
and the panels; input borders reach 3:1; white text reaches 4.5:1 on every solid colour; a subtle badge's
text reaches 4.5:1 on its own tint. `node scripts/check-contrast.mjs` checks all of it.

**The Signal Rule.** Colour is never alone: a status is an icon and a label (`<IcStatusBadge>`), a link is
underlined on hover and named by its words, a required field has an asterisk and the word in its error.

**The Rainbow Rule.** The seven wordmark colours (`bg-brand-*`) are decoration: the logo, the brand stripe.
Never for statuses, buttons or text.

## 3. Typography

One family: **Atkinson Hyperlegible Next** (Braille Institute), drawn so that similar letters cannot be
confused; it fits a camp built around inclusion and reads as professional. **Atkinson Hyperlegible Mono**
for codes (the signature code, ids).

| Role | Size | Weight |
|---|---|---|
| Page title (navbar `h1`) | 20px | 700 |
| Section title (`h2`) | 18px | 700 |
| Auth page title | 24px | 700 |
| Big number (stat) | 30px | 700, tabular |
| Body | 16px / 1.55 | 400 |
| Labels, buttons | 14 to 16px | 600 |
| Meta, help | 14px | 400 |

Never below 14px for text people read. Paragraphs stay within `max-w-prose`. Numbers that line up use
`tabular-nums`.

## 4. Surfaces and elevation

Cream page, white panels with a 1px `border-default`. Radius: `--ui-radius` is 0.25rem (buttons,
inputs, badges); panels are `rounded-lg` (8px). No shadows on panels; floating layers
(menus, modals, toasts) get Nuxt UI's shadow. Sections inside a page are separated by a rule
(`<IcSection>`), not boxed. Cards only for things the user picks among or for the stat tiles.

## 5. Components

- **Shell**: `layouts/default.vue`, sidebar with the role's sections (`useNav`), account menu at the
  bottom. Every page is an `<IcPage title>` (navbar with the page's `h1`, back button, actions slot).
- **Sections**: `<IcSection title description>` with an actions slot.
- **Status**: `<IcStatusBadge kind value>`; labels, icons and colours come from `ENUM_META`
  (`shared/utils/constants.ts`).
- **Numbers**: `<IcStatCard label value hint icon to>`.
- **Details**: `<IcDataList :items>` (label and value; empty reads "Non indicato").
- **Lists**: `UTable` for the administration (sortable columns, row actions in a `UDropdownMenu`), row
  lists for phones. Empty lists: `UEmpty` with a sentence that teaches and the first action.
- **Forms**: `UForm` with the shared zod schema, `UFormField` with label, help and hint ("Facoltativo"),
  one column on phones, two at most on desktop. Submit button at the end, primary.
- **Calendar**: `<IcCalendarMonth :events>` (month grid on desktop, agenda on phones).
- **Files**: `<IcFileUpload endpoint>`, `<IcFileLink :file>`, `<IcPdfViewer src title>`.
- **Confirmation**: `useConfirm()` before actions that send emails, cancel or remove; the description
  says what happens and how many people receive an email.
- **Feedback**: `notifySuccess` / `notifyError` toasts (top right); inline `UAlert` for states that
  persist (an account to confirm, a form to complete).

## 6. Voice

Italian, the "tu" form for the person using the account ("la tua famiglia"); the family questionnaire may
speak to the family as "voi". Short sentences, active verbs on buttons ("Invia la convocazione", "Chiama
la riserva", "Firma il documento"). No em dashes, no exclamation marks, no "ops". Errors say what happened
and what to do. People-first language: "persona con disabilità", never "disabile" as a noun.

## 7. Do's and Don'ts

Do: one solid primary button per view; show the state and the next step; say how many emails an action
sends; keep forms short and in plain words; test every page at 390px wide.

Don't: raw hex in components; colour as the only signal; cards inside cards; modals for content that
deserves a page; tables on phones without a row-list alternative; health details in lists, emails or
toasts.
