# Build brief: the first build of the gestionale

Five area agents build the product in parallel, in the same working tree, on the foundation that is
already in place (data model, auth, API helpers, emails, files, design tokens, shell, shared components,
scripts, demo data). Read, in this order: `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `docs/spec.md`
(sections 0 to 2 and the ones of your area), then the code you build on: `server/db/schema.ts`,
`shared/utils/*`, `shared/types/*`, `shared/schemas/*`, `server/utils/*`, `server/domain/*`,
`server/emails/*`, `app/components/ic/*`, `app/composables/*`.

`docs/spec.md` is the authority on behaviour, DESIGN.md on looks, this file on who builds what. P0 must
ship; P1 if time allows, in the order listed.

## The foundation (do not rewrite it)

- **Data**: `server/db/schema.ts` is frozen for this build, migrations too. If you truly need a column,
  write it in your final report instead.
- **Enumerations** (`shared/utils/constants.ts`), routes (`shared/utils/routes.ts`), session rules
  (`shared/utils/session-status.ts`), slots (`shared/utils/slots.ts`), dates and formatting
  (`shared/utils/dates.ts`, `shared/utils/format.ts`): frozen. Use them.
- **Server helpers** (auto-imported in `server/api`): `useDb()`, `tables`, `requireUser`, `requireAdmin`,
  `requireFamily`, `requireStaff(event, { approved })`, `requireUuidParam`, `parseBody`, `parseQuery`,
  `rateLimit`, `audit`, `deliver`, `emailContext`, `readUpload`, `saveFile`, `sendFile`, `requireFileRow`,
  `removeFile`, `isUniqueViolation`, `toSessionUser`, `clientIp`.
- **Domain** (explicit imports, no auto-imports, testable): `server/domain/db.ts` (types `Db`, `DbOrTx`),
  `tokens.ts` (`issueToken`, `consumeToken`), `storage.ts`, `audit.ts` (`writeAudit`),
  `signature-requests.ts` (`requestSignatures`, `signatureRequestEmails`), `seed.ts`, `errors.ts`
  (`DomainError`, `createError`: an h3-compatible error the database tests can load).
- **Emails**: `server/emails/layout.ts` (`renderEmail`, `appLink`, `escapeHtml`), `types.ts`
  (`EmailMessage`), `auth.ts`, `signatures.ts`. Your templates go in your own file (below) and return
  `EmailMessage`.
- **Client**: `IcPage`, `IcSection`, `IcStatusBadge`, `IcStatCard`, `IcDataList`, `IcCalendarMonth`,
  `IcFileUpload`, `IcFileLink`, `IcPdfViewer`, `IcPasswordInput`, `IcEmailSent`, `IcLogo`;
  `useApi()`, `useApiFetch()`, `useEnums()`, `useConfirm()`, `useNav()` (every page is already in the
  sidebar); `notifyError`, `notifySuccess`, `apiErrorMessage`, `apiErrorData`.
- **Shell and auth pages**: done. **Placeholders**: the role homes and the contract components below
  exist with their final props; their owner replaces the body.

## Contracts between areas

Components (stubs exist with the final props; the owner replaces the body, the others embed them now):

| Component | Props | Owner | Embedded by |
|---|---|---|---|
| `components/sessions/FamiliesPanel.vue` | `sessionId` | A1 | A1 session page |
| `components/sessions/FamilyInvitations.vue` | none | A1 | A3 family home |
| `components/sessions/FamilyHistory.vue` | `familyId` | A1 | A3 admin family page |
| `components/staff/SessionStaffPanel.vue` | `sessionId` | A2 | A1 session page |
| `components/documents/SessionDocumentsPanel.vue` | `sessionId` | A4 | A1 session page |
| `components/documents/PendingSignatures.vue` | none | A4 | A3 family home and documenti, A2 staff home and documenti |
| `components/documents/UserSignatures.vue` | `userId` | A4 | A3 admin family page, A2 admin staff page |
| `components/communications/SessionCommunicationsPanel.vue` | `sessionId` | A5 | A1 session page |

Endpoints other areas call:

- A1 `GET /api/admin/sessions?status=draft,inviting,confirmed` → `SessionListItem[]` (`shared/types/sessions.ts`),
  `POST /api/admin/sessions/:id/families` body `{ familyIds: string[], kind: 'slot' | 'reserve' }` →
  `{ added: number, invited: number }` (A3 "Aggiungi a una sessione").
- A5 composer prefill: `/admin/comunicazioni/nuova?audience=session_families&sessionId=…`,
  `?audience=session_staff&sessionId=…`, `?userIds=id1,id2` (buttons "Scrivi" of A1, A2, A3).
- A4 signing page `/firma/:requestId` (linked from emails and PendingSignatures).
- Foundation `requestSignatures()` + `signatureRequestEmails()` (A2 on accept, A4 on assign).

Tables you write: A1 `camp_sessions`, `session_families`; A2 `staff_profiles`, `staff_availability`,
`session_staff`, `personal_documents` of staff accounts; A3 `families`, `family_members`,
`personal_documents` of family accounts; A4 `documents`, `signature_requests`, signed copies in `files`;
A5 `communications`, `users` (status, invitations) and their tokens. Everyone writes `audit_log` through
`audit()`, `email_log` through `deliver()`, `files` through `saveFile()`. Read any table you need in your
own endpoints.

## Rules for everyone

1. **Own your files.** Create and edit only the files of your area (listed below) plus new files inside
   your own folders. Never edit another area's files or the foundation. If the foundation has a bug or
   lacks something, work around it locally and describe the fix in your final report.
2. **API**: first line of every handler is the access check (`requireAdmin`, `requireFamily`,
   `requireStaff`). Validate with `parseBody` / `parseQuery` and a zod schema from your
   `shared/schemas/<area>.ts` (the same schema feeds the `UForm`). Return DTOs typed in
   `shared/types/<area>.ts`, never raw rows of `users` (they hold the password hash). Ids from the client
   are checked against ownership. Errors with `createError({ statusCode, message })`, message in Italian.
3. **Logic that touches several tables or sends emails** goes in `server/domain/<area>.ts`: explicit
   imports, takes `db` (or a transaction), returns the `EmailMessage[]` to send. The handler runs it in
   `useDb().transaction(...)` and calls `deliver(messages)` after the commit. Domain functions throw
   `createError` imported from `./errors` (h3 is not a direct dependency, so tests cannot load it). Cover
   them with database tests.
4. **Imports**: shared code explicitly from `#shared/...` (app and server); Nuxt, Nitro and Nuxt UI
   composables stay auto-imported.
5. **Design**: DESIGN.md. `IcPage` for every page, `IcSection` inside, `IcStatusBadge` for every status,
   `UTable` for admin lists with a row-list on phones, `UEmpty` that teaches, one primary action per view,
   `useConfirm()` before anything that sends emails (say how many) or removes something. Italian copy,
   "tu", no em dashes. Dates with `formatDay` / `formatDayRange` / `formatDateTime`.
6. **Accessibility**: WCAG 2.2 AA; labels on every field; icon-only buttons with `aria-label`; tables with
   headers; keyboard alternatives to drag (buttons "Sposta su/giù"); 44px targets on phones.
7. **Phones**: every page works at 390px (sidebar collapses; tables become row lists or scroll).
8. **Privacy**: health details (`family_members.disability`, `hasDisability`) only in the family's own
   pages and the admin family page, in a section marked reserved; never in lists, emails, toasts, logs.
9. **Do not** install packages, run `nuxt prepare`, `drizzle-kit`, `db:migrate` or `dev-seed --fresh`,
   restart the dev server, or change the demo data that other areas look at (the demo sessions, the
   accounts `admin@`, `famiglia@`, `staff@`, `candidato@`). Create your own test data (a new session, a
   new family through `/registrati`) through the API or the UI. The dev server is already running on
   port 3080.
10. **Verify** before you finish:
    - `pnpm exec vue-tsc -b --noEmit 2>&1 | grep "error TS" | grep -E "<your folders>"`: no errors in your
      files (other areas may be mid-work; ignore theirs).
    - Database tests with **your own** test database, so runs do not drop each other's:
      `TEST_DATABASE_URL=postgres://invictuscamp:invictuscamp@localhost:5436/invictuscamp_<area>_test pnpm exec vitest run --project db tests/db/<your file>`.
      Unit tests: `pnpm exec vitest run --project unit tests/unit/<your file>`.
    - `node scripts/page-check.mjs "<path>" --as <who>` and `--mobile` for each of your pages: zero
      errors; open the screenshot with Read and judge it against DESIGN.md. Use `--action` to exercise the
      main interaction (click, fill, press).
    - `node scripts/check-icons.mjs` (every icon exists).
    - `pnpm exec prettier --write <your files>`.
11. **Final report** (your last message, at most 40 lines): what you built (P0/P1), what is missing or
    partial, files created, foundation fixes you need, how you verified.

## Areas

### A1. Sessioni (sessions, places and reserves, the family's sessions)

Files: `app/pages/admin/sessioni/**`, `app/pages/famiglia/sessioni.vue`, `app/components/sessions/**`,
`server/api/admin/sessions/**`, `server/api/family/sessions/**`, `server/domain/sessions.ts`,
`server/emails/sessions.ts`, `shared/schemas/sessions.ts`, `shared/types/sessions.ts`,
`tests/db/sessions.test.ts`, `tests/unit/sessions*.test.ts`.

P0:
- List `/admin/sessioni`: upcoming first then past; filter by status; columns title, dates, status, places
  (held/total, confirmed), reserves waiting, staff (confirmed/needed). "Nuova sessione".
- Create and edit (`/admin/sessioni/nuova`, edit in the session page): title, description, place
  (default `DEFAULT_LOCATION`), dates, places for families, staff needed, answer deadline, contract (a
  document of category `contract`, read from `documents`), internal notes. Editable while
  `isSessionEditable`; places cannot drop below the titolari holding one.
- Session page `/admin/sessioni/:id`: header with status and the valid moves (`SESSION_TRANSITIONS`,
  `SESSION_TRANSITION_ACTIONS`); each move opens a confirmation that states `SESSION_TRANSITION_EFFECTS`
  and the exact number of emails, then applies it (spec 3.2). Tabs: Panoramica (facts, `slotSummary`,
  staff summary), Famiglie (`FamiliesPanel`), Staff (`SessionStaffPanel`), Documenti
  (`SessionDocumentsPanel`), Comunicazioni (`SessionCommunicationsPanel`). Tab in the query string.
- `FamiliesPanel`: titolari and reserves with status; add families (search, as titolare or reserve,
  refuse titolari beyond the places); "Chiama la riserva" (next or a chosen one) when a place is free;
  reorder reserves with buttons; record an answer received by phone; remove (cancel) with confirmation;
  resend the invitation. All per spec 3.3, emails per spec 4.
- `server/domain/sessions.ts`: `transitionSession`, `addFamilies`, `callReserve`, `answerInvitation`,
  `cancelParticipation`, `reorderReserves`, `resendInvitation`; each returns the emails. Database tests
  for every rule of spec 3.2 and 3.3.
- Family side: `/famiglia/sessioni` with `IcCalendarMonth`, invitations to answer, upcoming, history
  (only participations not `selected`); `FamilyInvitations` (answer from the home); `FamilyHistory`
  (admin family page).
- The contract endpoints `GET /api/admin/sessions` and `POST /api/admin/sessions/:id/families`.

P1: delete a draft session without participants; duplicate a session; CSV of the participants.

### A2. Staff (applications, review, availability, convocations)

Files: `app/pages/admin/staff/**`, `app/pages/staff/**`, `app/components/staff/**`,
`server/api/admin/staff/**`, `server/api/admin/convocations/**`, `server/api/staff/**`,
`server/domain/staff.ts`, `server/emails/staff.ts`, `shared/schemas/staff.ts`, `shared/types/staff.ts`,
`tests/db/staff.test.ts`, `tests/unit/staff*.test.ts`.

P0:
- `/admin/staff` with tabs: Da valutare (`applied`), Staff approvato, Tutti; search; filter by role;
  columns name, roles, city, status, applied on, next availability.
- `/admin/staff/:userId`: contacts, application (roles, qualifications, experience, motivation, CV),
  availability periods, convocations, personal documents, `UserSignatures`; review: approve or reject
  with internal notes; "Comunica l’esito" (explicit, message prefilled and editable, `staff.approved` /
  `staff.rejected`); deactivate / reactivate (spec 3.4).
- `SessionStaffPanel`: convocations of the session with status and derived "Confermata" (contract
  signed); add approved staff from a list showing coverage of the session dates (`rangeCoverage`) and
  roles; choose the role for the session; "Invia la convocazione" (one or selected, optional message);
  cancel (spec 3.5).
- Staff side: `/staff` home that adapts to the status (complete the application, waiting, approved:
  next convocations, `PendingSignatures`, availability prompt; not selected: a kind message);
  `/staff/candidatura` (form + CV upload as PDF, send → `applied`; editable while `registered`);
  `/staff/disponibilita` (periods: add, remove; refused before approval); `/staff/convocazioni` (accept,
  decline with reason; accept creates the contract request with `requestSignatures` and sends it);
  `/staff/sessioni` (calendar and list of accepted sessions); `/staff/documenti` (`PendingSignatures` +
  personal documents upload with category and title).
- Database tests: review, convocation send, accept with and without contract, availability rules.

P1: bulk approve; filter staff by coverage of a session.

### A3. Famiglie (family records, questionnaire, members, documents)

Files: `app/pages/admin/famiglie/**`, `app/pages/famiglia/index.vue`, `app/pages/famiglia/profilo.vue`,
`app/pages/famiglia/membri.vue`, `app/pages/famiglia/documenti.vue`, `app/components/families/**`,
`server/api/admin/families/**`, `server/api/family/home.get.ts`, `server/api/family/profile/**`,
`server/api/family/members/**`, `server/api/family/documents/**`, `server/domain/families.ts`,
`shared/schemas/families.ts`, `shared/types/families.ts`, `shared/content/family-form.ts` (copy only, keep
the ids), `tests/db/families.test.ts`.

P0:
- `/admin/famiglie`: search, filters (questionnaire status, province, with a member with disability);
  columns family, referent, city, members, questionnaire status, last session. No health details here.
- `/admin/famiglie/:id`: data and contacts, members with the reserved health section, questionnaire
  answers by section, personal documents, `FamilyHistory`, `UserSignatures`, internal notes (editable,
  never shown to the family), "Aggiungi a una sessione" (modal: a session from A1's list, titolare or
  reserve, calls A1's endpoint), "Scrivi alla famiglia" (A5 composer with `?userIds=`).
- Family side: `/famiglia` home (greeting, what to do next as a short checklist: questionnaire, members,
  health consent, documents to sign; `FamilyInvitations`; next session); `/famiglia/profilo` (family data
  and the questionnaire from `shared/content/family-form.ts`, save as draft, send; still editable after);
  `/famiglia/membri` (add, edit, remove members; disability fields only after the health consent, which
  can be given and withdrawn, spec 3.8; audit `member.health_update`); `/famiglia/documenti`
  (`PendingSignatures` + personal documents: upload with category, title, member; delete own).
- Database tests: ownership (a family never reads another's members), consent rule, questionnaire submit.

P1: admin edits a family's data on its behalf; export of the families list (CSV, no health details).

### A4. Documenti e firme

Files: `app/pages/admin/documenti/**`, `app/pages/firma/**`, `app/components/documents/**`,
`server/api/admin/documents/**`, `server/api/admin/signatures/**`, `server/api/signatures/**`,
`server/api/dev/otp/**` (dev only), `server/domain/signatures.ts`, `server/emails/documents.ts`,
`shared/schemas/documents.ts`, `shared/types/documents.ts`, `tests/db/signatures.test.ts`,
`tests/unit/documents*.test.ts`.

P0:
- `/admin/documenti`: list (title, category, session, to sign or to read, progress signed/assigned,
  uploaded on); upload a PDF with title, category, description, "da firmare", optional session.
- `/admin/documenti/:id`: preview (`IcPdfViewer`), details, assign (chosen people, all families, all
  approved staff, families of a session, staff of a session; optional due date; confirmation with the
  number of emails), requests table (person, status, signed at, typed name, reminder, cancel, signed copy),
  "Sollecita tutti", archive.
- `/firma/:requestId` (only the assignee; family or staff layout): document, consent checkbox, typed
  name, "Invia il codice" (`UPinInput`, 6 digits, 10 minutes, 5 attempts, resend after 60 seconds),
  "Firma"; then the success state with the signed copy. Spec 3.6 in full: hash, IP, user agent,
  certificate page appended with `pdf-lib` (Helvetica: replace characters outside WinAnsi), signed copy
  stored as `signed_copy` owned by the signer, `signature.signed` email, audit `signature.sign`.
  Seeded signed requests have no copy: generate it at the first download.
- `PendingSignatures` (mine: to sign with a link to `/firma/:id`, signed with their copy),
  `UserSignatures` (admin, one account), `SessionDocumentsPanel` (documents of the session and their
  progress, assign to the session's families or staff).
- In development only, keep the last code of each request in memory and expose
  `GET /api/dev/otp/:requestId` (404 when not `import.meta.dev`) so scripts can sign.
- Database tests: code expiry and attempts, signing stores the hash, a second signature is refused,
  only the assignee can sign; unit test: the certificate PDF opens with `pdf-lib` and has one more page.

P1: replace the file of a document nobody signed yet; download all signed copies of a document (zip is
out: list of links is fine).

### A5. Comunicazioni, panoramica, utenti

Files: `app/pages/admin/index.vue`, `app/pages/admin/comunicazioni/**`, `app/pages/admin/utenti/**`,
`app/components/communications/**`, `app/components/dashboard/**`, `app/components/users/**`,
`server/api/admin/dashboard.get.ts`, `server/api/admin/communications/**`,
`server/api/admin/email-log/**`, `server/api/admin/users/**`, `server/domain/audiences.ts`,
`server/domain/users.ts`, `server/emails/communications.ts`, `shared/schemas/communications.ts`,
`shared/schemas/users.ts`, `shared/types/communications.ts`, `shared/types/dashboard.ts`,
`shared/types/users.ts`, `tests/db/communications.test.ts`.

P0:
- `/admin` Panoramica per spec 3.9 (read the `dataviz` skill before drawing any chart or meter; stat
  tiles with `IcStatCard`, progress as labelled bars, every number links to its list).
- `/admin/comunicazioni`: tabs Messaggi (sent communications) and Registro email (`email_log` with
  filters: template, status, recipient; content of non-sensitive emails in a slideover).
- `/admin/comunicazioni/nuova`: audience (spec 3.7; prefill from the query string), live count of
  recipients, subject, body, preview with `renderEmail`, confirmation "Invierai N email", send.
  `/admin/comunicazioni/:id`: the message and its recipients with status.
- `server/domain/audiences.ts`: resolve an `Audience` to recipients (active accounts only, deduplicated).
  Database tests for every audience type.
- `SessionCommunicationsPanel`: the emails of the session (`email_log.sessionId`) and its
  communications; buttons to write to its families or staff.
- `/admin/utenti`: every account (search, role, status); invite (role, names, email; for a family also
  its name, for staff the starting status), resend the invitation, disable and enable (never yourself),
  send a password reset; audit `user.invite`, `user.disable`, `user.enable`.

P1: save a communication as draft; filter the log by session.
