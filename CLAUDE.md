# Invictus Camp · Gestionale

Internal management app of Invictus Camp, the recreational therapy camp in Maruggio (TA) for families
with a child or teenager with a disability. Three roles: administration, families, staff. Italian UI.

- **PRODUCT.md**: who it is for, what it promises, principles. The authority on product decisions.
- **DESIGN.md**: the visual system. The authority on how things look.
- **docs/spec.md**: roles, pages, flows and their states, emails, privacy. The authority on behaviour.
- **docs/BUILD.md**: the first build: areas, contracts between them, rules.

## Stack and commands

Nuxt 4 (`app/` directory, SPA: `ssr: false`), Nuxt UI 4 (Tailwind 4), nuxt-auth-utils (email + password,
sealed cookie), PostgreSQL 17 + Drizzle ORM (postgres.js), zod 4, Resend, pdf-lib, vitest, Playwright.
Package manager: pnpm.

```bash
pnpm db:up                 # Postgres in Docker (container invictuscamp-db, port 5436)
pnpm db:generate           # after editing server/db/schema.ts
pnpm db:migrate            # apply migrations (one line)
pnpm dev                   # http://localhost:3080
pnpm db:seed [--fresh]     # demo data through the dev server: admin@ famiglia@ staff@ candidato@ nuova@
                           #   invictuscamp.local, password invictus-demo
pnpm test                  # unit + database tests (the db project recreates invictuscamp_test)
pnpm exec vue-tsc -b --noEmit 2>&1 | grep "error TS"     # typecheck, filtered
node scripts/page-check.mjs "/admin/sessioni/{session}" --as admin [--mobile]   # one page: errors + screenshot
node scripts/check-pages.mjs                # every page of every role, desktop and phone
node scripts/check-contrast.mjs             # the palette passes WCAG AA (DESIGN.md, Verified Rule)
node scripts/check-icons.mjs                # every i-lucide-* icon exists
node scripts/ci-local.mjs                   # local CI: format, types, icons, contrast, unit, db, build
```

Every check prints a few lines and exits with a code: read the outcome, not logs.

## Layout

```
app/
  pages/          public auth pages, account, admin/*, famiglia/*, staff/*, firma/[id]
  layouts/        default (dashboard shell), auth (public pages)
  components/ic/  shared building blocks <Ic...>: Page, Section, StatusBadge, StatCard, DataList,
                  CalendarMonth, FileUpload, FileLink, PdfViewer, PasswordInput, EmailSent, Logo, ConfirmModal
  components/<area>/   sessions, staff, families, documents, communications, dashboard, users, programme, lodgings,
                       groups
  composables/    useApi, useApiFetch, useEnums, useConfirm, useNav
  utils/errors.ts notifyError, notifySuccess, apiErrorMessage
server/
  db/schema.ts    the data model (read it first); migrations in db/migrations
  api/            auth, account, files, dev (development only), admin/*, family/*, staff/*, signatures/*
  utils/          auto-imported: db, auth (requireAdmin/Family/Staff), validation, rate-limit, email
                  (deliver), files, audit
  domain/         explicit imports, testable against a real database: tokens, storage, audit,
                  signature-requests, seed, errors (h3-compatible createError), and one module per area
  emails/         layout + one template file per area; templates return EmailMessage
shared/
  utils/          constants (every enumeration + ENUM_META labels/icons/colours), dates, format,
                  session-status, slots, routes
  schemas/        zod schemas shared by UForm and parseBody
  types/          DTOs of the API, jsonb shapes, the session user
  content/        family-form.ts (placeholder questionnaire, sprint 1)
                  programme-template.ts (the model week: Nicola's 2027 draft)
tests/unit, tests/db   vitest projects `unit` and `db`
```

## Rules

- **Access**: every API handler starts with `requireAdmin` / `requireFamily` / `requireStaff`; ids from the
  client are checked against ownership; never return `users` rows as they are (password hash).
- **Validation**: `parseBody` / `parseQuery` with the zod schema from `shared/schemas`, the same one the
  form uses.
- **Domain logic** that spans tables or sends emails lives in `server/domain/<area>.ts`, returns
  `EmailMessage[]`; handlers run it in a transaction and call `deliver()` after the commit.
- **Emails**: `deliver()` sends with Resend or records them as simulated; everything lands in `email_log`.
  Access links and codes are `sensitive` (not stored). No health details in emails.
- **Health data** (`family_members.disability`): only after the family's explicit consent, only in the
  family's pages and the admin family page, audited on change. The admin family list shows only the ages
  of the members with a condition (`hasDisability`), never the details; the CSV export shows neither.
- **Files**: never public; upload with `readUpload` + `saveFile`, download through an authorised endpoint.
- **Imports**: shared code explicitly from `#shared/...`; domain and email modules with explicit imports
  only (no auto-imports) so tests can load them.
- **Client**: data with `useApiFetch` / `useApi()`; errors with `notifyError`; statuses with
  `<IcStatusBadge>`; dates with `#shared/utils/format`; destructive or email-sending actions through
  `useConfirm()` saying how many emails leave. With the typed `$fetch` of `useApi()`, build a dynamic URL
  as `const url: string` first: a template route can hit "excessive stack depth" or allow only GET.
- **Design** (DESIGN.md): semantic classes, never raw colours; one primary action per view; Italian copy
  with "tu", no em dashes; WCAG 2.2 AA; every page works at 390px.

## Infrastructure

- Local: Postgres 17 in Docker (`docker-compose.yml`). Test deployment: Coolify, database on
  `shared-postgres` (project `shared-infra`) with its own role and database created by
  `scripts/migrate.mjs` through `DATABASE_ADMIN_URL` on the first start. Production database: Supabase, to
  be decided together; the app uses plain Postgres, so the move is `DATABASE_URL` plus file storage.
- `Dockerfile` builds the server and runs the migrations at start; uploads need a persistent volume
  (`NUXT_UPLOADS_DIR`).

## Workflow

Work on a branch and open a PR. Before asking for the merge: green local CI (`node scripts/ci-local.mjs`),
then `/code-review` on the PR and `/simplify` on its changes, fixes committed, CI green again.
