# Specification · Sprint 1

What the gestionale does and how each flow behaves. PRODUCT.md says why, DESIGN.md how it looks,
docs/BUILD.md who builds what. Data model: `server/db/schema.ts`; enumerations: `shared/utils/constants.ts`.

## 0. Words

- **Sessione**: a period of the camp (dates, place, `familySlots` places for families, `staffNeeded`).
- **Titolare** (`kind: slot`): a family holding one of the places of a session.
- **Riserva** (`kind: reserve`): a family waiting, in `reserveRank` order, for a place to free up.
- **Invito**: a family is asked to confirm or decline its place. Sent when the session changes status.
- **Candidatura**: a person's application to the staff. **Staff approvato**: an accepted application.
- **Squadra**: the staff side has two teams, **Staff** and **V-team** (volunteers), each with its coordinator.
- **Disponibilità**: a staff or v-team member says "ci sono" for a whole session (never part of it).
- **Convocazione**: a staff member called to a session. **Confermata** = accepted and, if the session
  has a contract, contract signed (derived, not stored).
- **Firma**: a simple electronic signature (FES) confirmed by a one-time code sent by email.

## 1. Roles

| | Administration | Family | Staff |
|---|---|---|---|
| Sessions | all, every action | their own, after being invited | their own, after a convocation |
| Families | all, health details included | their own | no |
| Staff | all | no | their own |
| Documents | upload, assign, follow, download | sign their own, upload personal ones | sign their own, upload personal ones |
| Communications | write, send, read the log | receive | receive |
| Accounts | invite, disable, reset | their own | their own |

The server enforces this on every request (`requireAdmin`, `requireFamily`, `requireStaff`); the client
middleware only keeps people on their own pages. A family or staff member never sees another person's data.

## 2. Pages

Public: `/accedi`, `/registrati` (family), `/candidati` (staff), `/password-dimenticata`,
`/reimposta-password?token`, `/invito?token`, `/verifica-email?token`, `/privacy`.

Administration: `/admin` (Panoramica), `/admin/sessioni`, `/admin/sessioni/nuova`, `/admin/sessioni/:id`
(tabs Panoramica, Famiglie, Staff, Programma, Documenti, Comunicazioni), `/admin/famiglie`, `/admin/famiglie/:id`,
`/admin/staff`, `/admin/staff/:userId`, `/admin/documenti`, `/admin/documenti/:id`,
`/admin/comunicazioni`, `/admin/comunicazioni/nuova`, `/admin/comunicazioni/:id`, `/admin/programma`,
`/admin/programma/:year` (3.10), `/admin/utenti`.

Family: `/famiglia` (home), `/famiglia/sessioni`, `/famiglia/profilo` (the family data, 3.8),
`/famiglia/membri`, `/famiglia/documenti`, `/famiglia/programma/:sessionId`. Staff: `/staff` (home), `/staff/candidatura`,
`/staff/disponibilita`, `/staff/convocazioni`, `/staff/sessioni`, `/staff/documenti`,
`/staff/programma/:sessionId`.
Everyone: `/account`, `/firma/:requestId`.

## 3. Flows

### 3.1 Accounts (foundation, done)

- A family registers at `/registrati` (family name, referent, email, phone, password, privacy): user `family`,
  a `families` row and the referent as first member (an adult); an email confirms the address (48 h).
  Sign-in is refused until the address is confirmed. The "Partecipa" or "Iscriviti" button of the camp's
  website links here. Once in, the first thing to do is the family data (3.8).
- A staff member registers at `/candidati`: user `staff` and a `staff_profiles` row `registered`; same
  confirmation. The application itself is completed inside the platform (3.4).
- The administration invites any role (`/admin/utenti`): user `invited` without password and an
  invitation email (7 days). Choosing the password activates the account. For a family the invitation also
  creates the `families` row; for staff the profile (`registered`, or `approved` when the administration
  says so).
- Password reset by email (1 hour). Changing the password closes the sessions on other devices.
- A `disabled` account cannot sign in and its open sessions stop at the next request.

### 3.2 Life of a session

`draft` (Bozza) → `inviting` (Inviti aperti) → `confirmed` (Confermata) → `completed` (Conclusa);
`cancelled` (Annullata) from any of the first three. No other moves (`shared/utils/session-status.ts`).
Every move is a button of the administration that first shows what it sends and to how many people.

| Move | Families | Emails |
|---|---|---|
| draft → inviting | titolari `selected` → `invited`; reserves `selected` → `invited` | `session.invite` to titolari (with the answer deadline), `session.reserve` to reserves |
| inviting → confirmed | none | `session.confirmed` to titolari `confirmed` |
| confirmed → completed | none | none |
| any → cancelled | `selected`/`invited`/`confirmed` → `cancelled`; staff convocations `sent`/`accepted` → `cancelled` (drafts deleted) and their pending contract requests cancelled, unless another accepted convocation of the person, in an open session, has the same contract | `session.cancelled` to those who had been invited (not to `selected`); `staff.convocation_cancelled` to staff whose convocation had been sent |

Moves to `completed` and `cancelled` are final: the confirmation says so ("Non si può tornare indietro").

While the session is `inviting` or `confirmed`, a family added as titolare is invited at once
(`session.invite`), a reserve gets `session.reserve`. In `draft` nothing is sent. "Ogni invito ad una
sessione avviene al cambio di stato": the status change is the moment invitations leave.

### 3.3 Families in a session: places and reserves

- `familySlots` places. Titolari `selected`, `invited` or `confirmed` hold a place; adding a titolare when
  no place is free is refused (add as reserve instead). Reserves are unlimited, ordered by `reserveRank`.
- A family answers an invitation from `/famiglia/sessioni` or its home: **Conferma** (`confirmed`) or
  **Rinuncia** with an optional reason (`declined`, the place frees up). Answers are allowed while the
  session is `inviting` or `confirmed`; after the answer deadline the button still works and the
  administration sees the date.
- The administration can also record an answer received by phone (same effect, audit `participation.answer_by_admin`).
- When a place is free, **Chiama la riserva** promotes the first waiting reserve (or the chosen one) to
  titolare: `kind: slot`, `reserveRank: null`; in `inviting`/`confirmed` it becomes `invited` and receives
  `session.slot_offered` ("si è liberato un posto"); in `draft` it becomes `selected`. Promotion is never
  automatic: the administration decides when to call.
- Removing a family: `cancelled` (with `session.removed` if it had been invited). Reserves can be reordered.
- A family sees a session only once invited: participations `selected` are invisible to families.

### 3.4 Staff application and review

`registered` → (the person completes and sends the application: team (staff or v-team), birth date, city,
roles, qualifications, experience, motivation, CV as PDF) → `applied` → the administration reviews: `approved` or `rejected`,
with internal notes never shown to the person → `inactive` when someone is no longer convoked.
The outcome email (`staff.approved` / `staff.rejected`) is **not automatic**: the administration sends it
from the dashboard when it chooses, with a message it can edit. Until approved, a staff member cannot give
availability or receive convocations. The administration can move a person to the other team from their page
(audited).

### 3.5 Availability, convocations, contract

- `/staff/disponibilita` lists the sessions not started yet (neither concluded nor cancelled), by date: approved
  staff and v-team switch "Ci sono" on or off for each one, for the whole session (`session_availability`).
  Taking it back keeps the convocations already received; the administration sees it on them.
- In a session's Staff tab the administration adds people as convocations `draft` with a role for the session,
  choosing only among the approved staff and v-team who said they are available for that session (the server
  does not refuse the others: the rule is about what is offered). The base of a session is `staffNeeded`
  people of the staff (10 by default) plus a **coordinator** of the staff and one of the v-team (role
  `coordinator`); the tab shows both coordinators, or "da scegliere".
- **Invia la convocazione** (one or many, optional message) → `sent` + `staff.convocation` email. Sending
  is always an explicit action ("puntualmente dalla dashboard").
- The staff member accepts or declines (with reason) from `/staff/convocazioni`. On accept, when the
  session has a contract document (`campSessions.contractDocumentId`), a signature request is created
  (`requestSignatures`) and `signature.request` is sent. The convocation reads **Confermata** when accepted
  and the contract (if any) is signed.
- Cancelling a convocation (`cancelled`) sends `staff.convocation_cancelled` if it had been sent.

### 3.6 Documents and signatures

- The administration uploads a PDF with title, category, description, "da firmare" (yes/no) and an optional
  session. It assigns it to: chosen people, all families, all approved staff, the families of a session
  (titolari invited or confirmed), the staff of a session (accepted). Each assignment is a
  `signature_requests` row (idempotent); `signature.request` emails go out; an optional due date.
- Signing (`/firma/:id`, only the assignee): read the document, tick "Ho letto il documento e lo accetto",
  type the full name, ask for the code (6 digits, 10 minutes, at most 5 attempts, a new code at most every
  60 seconds), enter it, sign. The server stores time, IP, user agent, typed name and the SHA-256 of the
  original, then produces the **signed copy**: the original PDF with a certificate page appended (who, email,
  when in Italian time, IP, SHA-256, request id, method "Firma elettronica semplice con codice OTP inviato
  via email"). Confirmation email `signature.signed`.
- Reminders (`signature.reminder`) one by one or for all pending; cancelling a request.
- `/admin/documenti` filters by who the live requests went to: families, staff, v-team.
- Requests signed in the demo data have no signed copy: the copy is generated at the first download.
- Legal note: an FES is valid but freely assessed by a judge (eIDAS art. 25, CAD art. 20). A qualified
  provider (FEA/FEQ) can be added later behind the same flow if the contracts require it.

### 3.7 Communications and the email log

- The administration writes a message (subject, plain text body; blank lines are paragraphs) to an
  audience (`Audience` in `shared/types/domain.ts`): all families, all approved staff, candidates to review,
  the families of a session (by kind and status), the staff of a session (by status), chosen people. The
  composer shows how many people receive it, previews the email, and confirms before sending.
- Sending records a `communications` row and one `email_log` row per recipient (`deliver()`). Disabled
  accounts never receive emails.
- The log lists every email the platform sent, automatic or written, with status (sent, failed,
  simulated) and, for non-sensitive emails, the content. Access emails and codes are never stored.

### 3.8 The family: family data, member cards, documents

- **Family data** (`/famiglia/profilo`, "Dati della famiglia"), the first form of the family: family name
  and phone (required); residence (street and number, city, CAP and region required, province optional); the
  composition, i.e. how many adults (the account holder included), how many young people with a severe or
  chronic illness, a neurodevelopmental disorder or a disability, how many without; and the questions of
  `shared/content/family-form.ts` (how they found the camp, association, preferred sessions: weekend with 2
  nights and/or summer week with 4 nights, accommodation needs: kitchen, bathroom without architectural
  barriers, microwave). Answers in `families.formAnswers` by question id. Every save needs the whole form.
- **Confirming** it (`formStatus` `draft` → `submitted`, `formSubmittedAt` the first time) creates one
  **card** (`family_members` row) per person declared: the cards already there count, so the account
  holder is the first adult, and the missing ones are created empty (no name, no relationship), with their
  `kind` (`adult`/`young`) and, for a young person with a condition, `hasDisability`. The page then opens
  Componenti. Example: 2 adults, 1 young person with a disability, 1 without → 3 new cards, 4 in all.
- Afterwards the family data stays editable and the composition shows the cards there. Raising a number
  creates the cards missing; a number below the cards is refused (409): a person goes away by changing or
  removing their card in Componenti.
- Declaring a young person with a condition is health data: when the family has not given the consent
  yet, the form asks for it next to the composition and gives it with the save (`family.health_consent`).
  Without it, the save is refused.
- **Member cards** (`/famiglia/membri`, "Componenti"): name, birth date, relationship, adult or young
  person, referent, and, with the consent, the question "ha una patologia o disabilità?" (Sì/No, No by
  default: nothing more to write) and, on Sì, its details (`DisabilityInfo`, placeholder fields, all
  required). An empty card reads "Adulto 2", "Ragazzo o ragazza 1" with "Da compilare"; filling it in
  requires name, surname, relationship and, for an adult, the birth date. Before the family data is confirmed the page shows only
  the account holder's card and points to the family data, and adding a card is refused (409); afterwards
  cards can also be added by hand, at most 12 per number of the composition (the most the form takes).
- The health data consent (`healthDataConsentAt`) can be given or withdrawn in Componenti; withdrawing
  deletes the details and the condition of every card (the card stays, as a young person without).
- Personal documents (certificates, diagnoses, ID, health card): PDF, JPG or PNG up to 15 MB, with a
  category, a title and optionally the member they refer to. Medical certificates and diagnoses are health
  data: uploaded only with the consent, deleted with their files when it is withdrawn.

### 3.9 Panoramica (administration home)

Numbers that lead to action: the next session (dates, countdown, places confirmed/total, staff
confirmed/needed), applications to review, families with the family data to confirm, signatures
waiting, emails failed in the last 30 days; the upcoming sessions with their progress; a "Da fare" list
(each item links to where it is done).

### 3.10 The week programme

The week of the camp, block by block, in `/admin/programma`. **One programme per year**: every session
uses the programme of the year it starts in, unless it has **a copy of its own** (tab Programma of the
session: "Crea una copia per questa sessione", edited there, valid for that session only; "Torna al
programma del 2027" deletes the copy). A new year starts from the model week (the 2027 draft by Nicola
Giulivo, `shared/content/programme-template.ts`), as a copy of another year, or empty.

- **Days and blocks**: Monday to Friday; each block has a time (start, optional end, or none), a title,
  a kind (attività a gruppi, tutti insieme, solo adulti, a scelta, accoglienza, pasto, riposo, libero,
  solo staff, partenza), who leads it, a note for everyone, an internal note, and two flags: "Da
  confermare" and "Novità" (compared with the year before).
- **Groups**: Giallo, Rosso, Blu rotate through the year's list of activities; a `groups` block says what
  each group does and who leads it. Beside the week the editor shows each group's rotation, flags an
  activity done twice or never, and lists what is still open (blocks to confirm, groups without an
  activity).
- **Saving**: the whole week at once with Salva; leaving with unsaved changes asks first. A save carries
  the revision it was loaded at: if someone saved in between, it is refused and nothing is overwritten.
- **Who reads it**: families invited to or confirmed in the session (link on their session card) and
  staff who accepted the convocation (`/staff/sessioni`), read-only, once the session is not cancelled.
  Families never see "solo staff" blocks, internal notes or the "Novità" flag; staff see everything but
  "Novità". The days carry the session's dates when the session starts on a Monday and is at least as
  long as the programme.
- **Closed sessions** keep the programme they had: completing or cancelling a session without a copy
  gives it one, and a closed session never falls back to the year's programme, so later changes to the
  year do not rewrite it. A completed or cancelled session's programme is no longer edited.

## 4. Emails

| Template | When | To |
|---|---|---|
| `auth.invite` | invitation by the administration, or reset asked by an invited user | the person |
| `auth.verify_email` | registration, new link | the person |
| `auth.reset_password` | password reset | the person |
| `session.invite` | session to `inviting`, titolare added while open | titolare |
| `session.reserve` | session to `inviting`, reserve added while open | reserve |
| `session.slot_offered` | reserve called while open | promoted family |
| `session.confirmed` | session to `confirmed` | titolari confirmed |
| `session.cancelled` | session cancelled | families invited or confirmed |
| `session.removed` | family removed after being invited | that family |
| `staff.convocation` | convocation sent | staff member |
| `staff.convocation_cancelled` | sent convocation cancelled, or its session cancelled | staff member |
| `staff.approved` / `staff.rejected` | sent by the administration from the review | candidate |
| `signature.request` / `signature.reminder` | document assigned / reminder | assignee |
| `signature.otp` | code requested | signer |
| `signature.signed` | signature completed | signer |
| `communication` | message from the dashboard | audience |

Emails never contain health details. Without `NUXT_RESEND_API_KEY` every email is recorded as
`simulated` and access links are printed in the dev console.

## 5. Privacy and security

- Health details: only after consent; visible to the family and the administration; not in lists, emails,
  toasts or logs; changes audited (`member.health_update`). The one exception: the administration's family
  list shows the ages of the members with a condition (no names, no details), not in the CSV export.
- Files are never public: downloads go through an authorised endpoint (`/api/files/:id` or an area endpoint).
- Every list or detail endpoint checks the role and the ownership; ids from the client are never trusted.
- Sensitive actions are recorded in `audit_log` (status changes, reviews, signatures, account changes).
- Rate limits on sign-in, registration, reset and signature codes.

## 6. Not in sprint 1

The details of each card beyond name, birth date and relationship (sprint 2, still to define with the
camp), automatic reserve promotion, Resend delivery
webhooks, a qualified e-signature provider, Supabase (decided together: the app uses plain Postgres, so
moving there is a change of `DATABASE_URL` and of the file storage), multilingual interface, dark mode.
