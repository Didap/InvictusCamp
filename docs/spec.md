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
(tabs Panoramica, Famiglie, Alloggi, Gruppi, Mensa, Staff, V-team, Programma, Documenti, Comunicazioni), `/admin/famiglie`,
`/admin/famiglie/:id`, `/admin/staff`, `/admin/staff/:userId`, `/admin/v-team`, `/admin/v-team/:userId` (3.4),
`/admin/documenti`, `/admin/documenti/:id`,
`/admin/comunicazioni`, `/admin/comunicazioni/nuova`, `/admin/comunicazioni/:id`, `/admin/programma`,
`/admin/programma/:year` (3.10), `/admin/alloggi` (3.11), `/admin/feedback` (3.13), `/admin/utenti`.

Family: `/famiglia` (home), `/famiglia/sessioni`, `/famiglia/profilo` (the family data, 3.8),
`/famiglia/membri`, `/famiglia/documenti`, `/famiglia/programma/:sessionId`, `/famiglia/questionario/:sessionId` (3.13). Staff: `/staff` (home), `/staff/scheda`,
`/staff/disponibilita`, `/staff/convocazioni`, `/staff/sessioni`, `/staff/documenti`,
`/staff/programma/:sessionId`.
Everyone: `/account`, `/firma/:requestId`.

## 3. Flows

### 3.1 Accounts (foundation, done)

- A family registers at `/registrati` (family name, referent with birth date, email, phone, password, privacy):
  user `family`, a `families` row and the referent as first member (an adult, born with the birth date); an
  email confirms the address (48 h).
  Sign-in is refused until the address is confirmed. The "Partecipa" or "Iscriviti" button of the camp's
  website links here. Once in, the first thing to do is the family data (3.8).
- A staff member applies at `/candidati` with name, surname, email, phone, password and the CV as PDF: user
  `staff` and a `staff_profiles` row `registered` with the CV; same confirmation, and confirming the address
  sends the application (3.4). `/candidati?squadra=v-team` (the v-team link of «Accedi») gives the row the
  v-team.
- Passwords have at least 8 characters.
- The administration invites any role (`/admin/utenti`): user `invited` without password and an
  invitation email (7 days). Choosing the password activates the account. For a family the invitation also
  creates the `families` row; for staff the profile (`registered`, or `approved` when the administration
  says so).
- Password reset by email (1 hour). Changing the password closes the sessions on other devices.
- A `disabled` account cannot sign in and its open sessions stop at the next request.

### 3.2 Life of a session

The 2027 calendar (`shared/content/calendar-2027.ts`) has 25 sessions numbered through the year: S1-S5
spring weekends (Friday to Sunday), S6-S18 summer weeks (Monday to Friday), S19-S25 autumn weekends.
Titles say the number and the kind ("Sessione 19 · Weekend d’autunno"), not the dates, which every list and
page, and the body of every email, show beside them. `scripts/create-calendar.mjs --apply --by <admin>`
creates them as drafts in a database, in the name of that administrator (audited), skipping a session
whose title is already there (cancelled or moved too) or whose days a session not cancelled takes; the
demo seed uses the same calendar. The admin Panoramica lists the next session and the three after it.

`draft` (Bozza) → `inviting` (Inviti aperti) → `confirmed` (Confermata) → `completed` (Conclusa);
`cancelled` (Annullata) from any of the first three. No other moves (`shared/utils/session-status.ts`).
Every move is a button of the administration that first shows what it sends and to how many people.

| Move | Families | Emails |
|---|---|---|
| draft → inviting | titolari `selected` → `invited`; reserves `selected` → `invited` | `session.invite` to titolari (with the answer deadline), `session.reserve` to reserves |
| inviting → confirmed | none | `session.confirmed` to titolari `confirmed` |
| confirmed → completed | none (the questionnaire opens, 3.13) | `session.feedback` to titolari `confirmed` |
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
- «Scarica le famiglie (CSV)» downloads the families of the session: referent, email, phone (the family's, else the
  account's), city, place, status, answer; no health details (audit `session.export`).
- **Storico** on `/famiglia/sessioni`: the past sessions, the declined and the cancelled ones. For a session
  the family was confirmed in that is over (completed, or past its last day): its activity group and who led it
  (an accepted convocation), its lodging with its area, and the programme when there is one.
- When a place is free, **Chiama la riserva** promotes the first waiting reserve (or the chosen one) to
  titolare: `kind: slot`, `reserveRank: null`; in `inviting`/`confirmed` it becomes `invited` and receives
  `session.slot_offered` ("si è liberato un posto"); in `draft` it becomes `selected`. Promotion is never
  automatic: the administration decides when to call.
- Removing a family: `cancelled` (with `session.removed` if it had been invited). Reserves can be reordered.
- A family sees a session only once invited: participations `selected` are invisible to families.

### 3.4 Staff application and review

`registered` → (the address confirmed, with the CV: the application is the account and the CV) → `applied` →
the administration reviews: `approved` or `rejected`, with internal notes never shown to the person →
`inactive` when someone is no longer convoked. A `registered` account without CV (made before the CV was asked
at registration, or invited by the administration) sends the application by uploading it from its home.
**Until the approval the area is the home alone**: the menu has nothing else, the other pages lead back
there (the session the client reads carries `staffStatus`, read again at every fetch) and the server refuses
every staff endpoint but the home and the CV (`requireStaff`, access `area` by default). A password reset confirms the address too, so
it sends the application like the confirmation link; migration 0026 sent the drafts of the old form that had
a CV and a confirmed address. The home says «Grazie per la tua richiesta, stiamo valutando la candidatura e presto riceverai
aggiornamenti», with the staff address (`contact.staffEmail`, staff@), or asks for the CV; not selected, a kind
message. Applications sent with the older, longer form keep birth date, city, roles and texts.

Once approved, «Scheda personale» (`/staff/scheda`, staff and v-team alike) takes the place of the application
page. Name, surname, email and phone are the account's, read only (changed from `/account`). To fill in, all
required but the province: birth date (the age counts itself as it is typed), birthplace, codice fiscale
(checked with its control letter, omocodia included), residence (street and number, city, CAP, province,
region) and the T-shirt size «per la divisa» (XS to 3XL). Saving is audited (`staff.sheet`) with the names of
the fields that changed, never their values. Under it, «Alimentazione e altre informazioni»: allergies and
intolerances, food preference and notes with the lists of the families (3.8), which reach the canteen (3.14),
and «Altro da condividere» (dyscalculia, dysgraphia, colour blindness…), which only the administration reads
(`staff_profiles.otherInfo`): both are health data under one consent, given again at every save (the box starts
empty, the date is the last save's); saving nothing withdraws it. Last, the
application as it was sent (team, roles, the older texts, CV). Until the sheet is complete the home asks for
it. The administration sees the sheet on the person's page, the health data in a reserved section opened on
demand and audited (`staff.health_view`), as for families.
Once the sheet is complete, the gestionale writes its PDF («Scheda personale · Nome Cognome»: the account's
name, email and phone, birth, codice fiscale, residence, T-shirt size and «Con la firma confermo che i dati di
questa scheda sono corretti e aggiornati»; no health data) and asks the person to sign it like every document,
with the code by email (3.6): the email «Hai un documento da firmare», «Firma la tua scheda» on the sheet and the
document among those to sign. A change of the sheet, or of name or phone from `/account`, makes it again: the
old one archived, its signature cancelled if still to sign (audited, `staff.sheet_document`). Like a family's
release it is never edited, assigned or restored by hand (`documents.staffUserId`); the administration finds it
in Documenti and in «Firme» on the person's page.
The outcome email (`staff.approved` / `staff.rejected`) is **not automatic**: the administration sends it
from the dashboard when it chooses, with a message it can edit. Until approved, a staff member cannot give
availability or receive convocations. The administration can move a person to the other team from their page
(audited).

- **Roles** are a list the administration keeps ("Ruoli e valutazione" in `/admin/staff`, table `staff_roles`):
  it creates, renames and deletes them, and gives them to people from their page once the application is
  sent (audited, `staff.roles`). Deleting a role takes it away from every
  person and convocation that has it. Migration 0023 keeps the four roles of the old fixed list with their keys:
  `coordinator` is the coordinator of the base of a session (3.5), so it can be renamed but not deleted;
  `group_lead` comes first among the staff who can lead an activity group (3.12).
- **Valutazione**: tags the administration creates in the same place (name and colour, table `staff_tags`;
  0023 brings the camp's examples: Staff tecnico, Leader, Animatore, Top, Energia moderata, Da guidare, In
  training) and gives to people from their page (audited, `staff.tags`). Never shown to the person.
- **Staff and v-team are two separate lists**, two items of the menu: `/admin/staff` and `/admin/v-team`, each
  with the pages of its people (`/admin/staff/:userId`, `/admin/v-team/:userId`). A person's page opened under
  the other team (an old link, the users list, a change of team) moves to the list of their team. The
  application is one for both: the team comes from the link (`/candidati?squadra=v-team`). Roles and Valutazione are the same for both lists. The Panoramica has a tile of applications to
  review for each list.
- Each list shows name, roles, city, age and Valutazione; status, application date and availability are on
  each person's page. Filters: search, role, age (ranges of years at today), availability (at least one
  session, none, or a session not started yet).

### 3.5 Availability, convocations, contract

- `/staff/disponibilita` lists the sessions not started yet (neither concluded nor cancelled), by date: approved
  staff and v-team switch "Ci sono" on or off for each one, for the whole session (`session_availability`).
  Taking it back keeps the convocations already received; the administration sees it on them. The page opens
  with the camp's text («In questa sezione puoi esprimere le tue preferenze… non costituisce una convocazione
  ufficiale né comporta alcun vincolo per la Fondazione…»). Each answer is saved at once; **«Conferma le
  preferenze»** fixes them (`staff_profiles.availabilityConfirmedAt`, audited `staff.availability_confirm` with
  the sessions the person is in for): the sessions that existed then can no longer be switched. A session created
  later can be answered and is confirmed in turn. To change, **«Chiedi il reset»** (`availabilityResetRequestedAt`,
  audited): the request is in the dashboard's to-do list and on the person's page, where **«Riapri la
  disponibilità»** (administration only, also without a request) clears both dates, keeps the answers and sends
  `staff.availability_reopened`. The home asks to confirm while sessions are still open.
- Staff and v-team of a session are **two tabs**, «Staff» and «V-team» (`?tab=staff`, `?tab=v-team`), each with
  its list, its coordinator, its «Aggiungi persone», its selection and «Invia la convocazione», and «Scrivi ai
  convocati» for that team only. The administration adds people as convocations `draft` with a role for the
  session, choosing only among the approved people of that team who said they are available for that session
  (the server does not refuse the others: the rule is about what is offered); the choice shows roles, age and
  Valutazione of each. The base of a session is `staffNeeded` people of the staff (10 by default) plus a
  **coordinator** of the staff and one of the v-team (role `coordinator`); each list shows its coordinator, or
  "da scegliere". Selecting and sending the convocations work across both lists.
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
  the families of a session (by kind and status), the staff or v-team of a session (by team and status), chosen people. The
  composer shows how many people receive it, previews the email, and confirms before sending.
- **Templates** ("Modelli", a tab of Comunicazioni): saved messages (name, subject, body) the composer starts
  from with "Parti da un modello"; the administration adds, edits and deletes them. Migration 0006 brings three
  examples: Convocazione staff, Convocazione famiglie, Promemoria documenti. A template may hold parts in
  square brackets ("[orario di arrivo]"): a message is not sent while one is left.
- **Fields** filled for each recipient, in the subject and the body: `{nome}` (the first name of the account)
  and, when the audience is the families or the staff of a session, `{sessione}` (its title) and `{date}`
  (its days). Any other word in braces, or a session field without a session, stops the sending with a
  message on the field. The preview fills them for the first recipient; the message keeps them as written.
- Sending records a `communications` row and one `email_log` row per recipient (`deliver()`). Disabled
  accounts never receive emails.
- The log lists every email the platform sent, automatic or written, with status (sent, failed,
  simulated) and, for non-sensitive emails, the content. Access emails and codes are never stored.

### 3.8 The family: family data, member cards, documents

- **Family data** (`/famiglia/profilo`, "Dati della famiglia"), the first form of the family: the family's
  surname, stored as «Famiglia Rossi» (the lists show it so), and phone (required); residence (street and number, city, CAP and region required, province optional); the
  composition, i.e. how many adults (the account holder included), how many young people with a severe or
  chronic illness, a neurodevelopmental disorder or a disability (at least one: the camp is for them, a family
  without any cannot confirm its data), how many without; and the questions of the questionnaire, which the
  administration edits (below). The starting ones, in
  `shared/content/family-form.ts`: how they found the camp, association, preferred sessions (weekend with 2
  nights and/or summer week with 4 nights), accommodation needs (kitchen, bathroom without architectural
  barriers, microwave), whether a dog comes along (with the notice that dogs cannot stay in the apartments and
  kennels nearby are at the family's expense), the two consents of the release. Answers in
  `families.formAnswers` by question id, a choice as the text of its option. Every save needs the whole form.
- **The questionnaire** (`/admin/famiglie/modulo`, from the Famiglie list): the administration adds, removes,
  orders and edits sections and questions (text, help, kind of answer: short text, long text, single
  choice, multiple choice, yes/no; options; required), with a preview as the family sees it. Stored in
  `questionnaires` (key `family`; no row: the form of the code), saved whole with its revision (two people
  editing: the later save is refused, 409), audited `family_form.update` with the previous version of
  every question changed. The rules that keep the answers right:
  - the questions the code reads (`LOCKED_QUESTIONS`: accommodation needs, read by the lodgings; the two
    consents, read by the release) change only in text, help and place: type, options and requirement
    always come from the code, also when the code changes them after a save;
  - the kind of answer of a question already in the form only widens (short text to long text): another
    kind is a new question;
  - renaming an option rewrites the answers that chose it; an option taken out leaves its answers, which the
    family's form no longer ticks;
  - a question taken out goes to `retired`: its answers stay, the admin record shows them under «Domande non
    più nel modulo», the family's saves keep them (answers to ids neither in the form nor retired go);
  - a required question a confirmed family must answer after a change (new, made required, its option
    taken out) leaves the family confirmed: its home and its form say so, and its next save needs the answer;
  - a family's save carries the revision of the form it answered: if the form changed meanwhile, 409 and
    the page loads the new questions, keeping what was typed. The two saves never cross (a lock on the form).
  The editor warns that health data does not belong here (it goes in the member cards, with the consent).
- **Confirming** it (`formStatus` `draft` → `submitted`, `formSubmittedAt` the first time) creates one
  **card** (`family_members` row) per person declared: the cards already there count, so the account
  holder is the first adult, and the missing ones are created empty (no name, no relationship), with their
  `kind` (`adult`/`young`) and, for a young person with a condition, `hasDisability`. The young people
  with a condition are asked their first name next to their number (one field per person added): their
  cards are born with it and the family's surname, so the others' relationship names them from the start.
  Until the family saves a card (`filledAt`), it is still the form's: the «-» removes it like an empty one. The page then opens
  Componenti. Example: 2 adults, 1 young person with a disability, 1 without → 3 new cards, 4 in all.
- Afterwards the family data stays editable and the composition shows the cards there. The «+» creates the
  cards missing; the «-» removes empty cards (the last ones first). A number below the cards filled in is
  refused (409): a person with data goes away by removing their card in Componenti.
- Declaring a young person with a condition is health data: when the family has not given the consent
  yet, the form asks for it next to the composition and gives it with the save (`family.health_consent`).
  Without it, the save is refused.
- **Member cards** (`/famiglia/membri`, "Componenti"): name, birth date, relationship to the young person
  with a condition ("Legame di parentela rispetto a Matteo": genitore, fratello/sorella, nonno/nonna,
  zio/zia, tutore, altro; that young person's own card has none), adult or young person, referent. With
  the consent: for a young person the question "ha una patologia o disabilità?" (Sì/No, No by default) and,
  on Sì, its details as multiple choices (`DisabilityInfo`, shared/content/member-form.ts: tipologia,
  supporto, mobilità, comunicazione, terapie, at least one each) with two optional texts, «Selettività
  alimentare» and «Altro da sapere»; for everyone «Informazioni utili su …» (`UsefulInfo`,
  `family_members.useful_info`): allergies and intolerances (the 14 EU allergens), one food preference,
  other notes. Food allergies are health data: the same consent covers them, withdrawing it deletes them
  too. An empty card reads "Adulto 2", "Ragazzo o ragazza 1" with "Da compilare"; filling it in
  requires name, surname, relationship (but for the young person with a condition) and everyone's birth date.
- **Release** (liberatoria): when the family data is confirmed, the two answers of its «Liberatoria» section are
  given (photos and videos during the stay, their publication) and every card is complete, the camp prepares the
  release with the members (name, birth date, relationship; never health data) as a PDF document of the family
  (category consent, `documents.familyId`, `sourceDigest` = digest of its data, a dot, digest of its text) for the
  account holder to sign in Documenti (audited `family.release`). When those data change (the family's or the
  administration's edits, the holder's name from `/account`), a new release with the text in force replaces it: the old one is archived and its
  pending signature cancelled; cards no longer complete archive it until they are. A release is never assigned
  to anyone else nor restored once archived.
- **The release text** (`/admin/famiglie/liberatoria`, from the Famiglie list; table `release_texts`, audited
  `release_text.update` with the text before): the administration writes it, with the fields {famiglia},
  {referente} (who signs: the account holder), {componenti} (alone in a paragraph, a line per member with birth
  date and relationship; inside a sentence, the names), {foto} and {pubblicazione} («autorizza» / «non
  autorizza»). {componenti}, {foto} and {pubblicazione} are required; a field it cannot fill or a lone brace is
  refused; blank lines separate paragraphs; a preview fills it with an example family. Until the first save the
  families sign the draft of the code (shared/content/release.ts), and the PDF says so. Two people editing: a
  save carrying an older revision is refused. A new text alone redoes nothing: the releases written with another
  one stay until the family's data changes, or until «Chiedi la firma sul nuovo testo» redoes them all (signed
  ones too: the confirm says how many emails leave and how many were signed).
- **Ages**: the camp takes young people with a condition from 5 to 21 (`GUEST_AGE`), counted today, as the
  admin list shows and filters them. One of them within the ages is enough. When
  every card is complete (after a save or a removal) and none is, the family gets one email (`family.age_notice`, never naming a
  condition; `families.ageNoticeAt`) and its home shows the same notice; the administration decides. Every filled card has «Carica il documento di identità», an upload of type `id_document` for
  that person, until one is there. Before the family data is confirmed the page shows only
  the account holder's card and points to the family data, and adding a card is refused (409); afterwards
  cards can also be added by hand, at most 12 per number of the composition (the most the form takes).
- The health data consent (`healthDataConsentAt`) can be given or withdrawn in Componenti; withdrawing
  deletes the details and the condition of every card (the card stays, as a young person without).
- Personal documents (certificates, diagnoses, ID, health card): PDF, JPG or PNG up to 15 MB, with a
  category, a title and optionally the member they refer to. Medical certificates and diagnoses are health
  data: uploaded only with the consent, deleted with their files when it is withdrawn.

### 3.9 Panoramica (administration home)

Numbers that lead to action: the next session (dates, countdown, places confirmed/total, staff
confirmed/needed), applications to review (staff, v-team), families with the family data to confirm, signatures
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
  solo staff, partenza), who leads it, a note for everyone, an internal note, and the flag "Da
  confermare".
- **Groups**: Giallo, Rosso, Blu rotate through the year's list of activities; a `groups` block says what
  each group does and who leads it. Under the week the editor shows each group's rotation, flags an
  activity done twice or never, and lists what is still open (blocks to confirm, groups without an
  activity).
- **Editor**: the week as a board, one column per day side by side (one under the other on a phone).
  A block opens with a click or a tap and moves by dragging it, within its day or to another one (on a
  touch screen after a short press, so a swipe still scrolls), or from its menu (su, giù, a un altro
  giorno). Families and staff read the week as a list, one day after the other.
- **Saving**: the whole week at once with Salva; leaving with unsaved changes asks first. A save carries
  the revision it was loaded at: if someone saved in between, it is refused and nothing is overwritten.
- **Who reads it**: families invited to or confirmed in the session (link on their session card) and
  staff who accepted the convocation (`/staff/sessioni`), read-only, once the session is not cancelled.
  Families never see "solo staff" blocks or internal notes; staff see everything. The days carry the session's dates when the session starts on a Monday and is at least as
  long as the programme.
- **On paper**: "PDF per le famiglie" in the Programma tab opens the programme the session uses as its
  families read it (no "solo staff" blocks, no internal notes), the saved version, to print and hand out;
  families open the same PDF from their programme page ("Stampa o scarica"). Day by day, each block with its
  time, title, kind, who leads it, the note and what each group does.
- **Closed sessions** keep the programme they had: completing or cancelling a session without a copy
  gives it one, and a closed session never falls back to the year's programme, so later changes to the
  year do not rewrite it. A completed or cancelled session's programme is no longer edited.

### 3.11 Lodgings

Where each family, and each member of the staff and v-team, sleeps during a session.

- **The layout** (`/admin/alloggi`, "Alloggi"): the lodgings of the camp, entered once and used by every
  session. Each one has a location, from a closed list that also groups the layout (B&B Melina, B&B Nu
  Suennu, Appartamenti Torricella, Alloggi Invictus Camp), a name (the room or the apartment), its beds
  (how many people sleep in it) and how many of them are single beds, double beds and sofa beds, whether
  it is accessible (without architectural barriers), what it offers (kitchen, bathroom without
  architectural barriers, microwave: the three needs the family data asks about) and notes. Editing a lodging leaves the families where they
  are and changes it everywhere, completed sessions included. Deleting one says in how many sessions it
  hosts a family: in open sessions those families are left without one (audited); a lodging in the
  layout of a completed session cannot be deleted.
- **The Alloggi tab** of a session lists the families holding a place (titolari selected, invited or
  confirmed, by name) with how many people they are (their cards) and their needs ("Esigenze per
  l'alloggio"), never the health details. Each family gets one lodging, and a lodging hosts one family
  per session: a lodging of another family is shown with its name and cannot be chosen. The tab flags a
  family with more people than beds, or placed where something it needs is missing; it does not refuse
  the choice. A reserve gets a lodging once called. Saving a choice sends no email and is audited.
- **Staff** and **V-team**, two lists: the people convoked to the session (a convocation not declined nor withdrawn) get a
  lodging each (`session_staff.lodgingId`, audited `convocation.lodging`). Several can share one, never
  with a family: a lodging of a family cannot be chosen for the staff and the other way round. More people
  than beds is flagged. Declining or withdrawing the convocation frees the lodging.
- **The layout of the session**: location by location, who sleeps in each lodging, the family or the
  staff. «Genera PDF dello schema» (the primary action) downloads it to print or send: each lodging with
  the family, its number of people and its referent with a phone (the family's, else the account's), or
  the staff, what to check and how the lodging is made; at the end, the families and the staff still
  without a lodging. «Scarica CSV» downloads the same as a table. Both are audited
  (`session.lodgings_export`, with `format: 'pdf'` for the PDF).
- A family that declines or is removed frees its lodging, and so does cancelling the session. A
  completed session keeps its layout, read-only. Families and staff do not see the lodgings, but a family sees its own in the history of a completed
  session (3.3).

### 3.12 Activity groups

The families of a session split into the groups of the programme (3.10), Giallo, Rosso and Blu, that
rotate through the activities together.

- **The Gruppi tab** of a session lists the families holding a place (titolari selected, invited or
  confirmed), each with its people: the first name, and the age at the start of the session for the young
  ones; never the health details. A family is in one group; the families without one are listed first.
- **Each group** shows how many families and people it has, and its leader: one person of the session staff
  (a convocation to send, sent or accepted). A person leads one group: choosing who leads another one moves
  them there.
- **"Dividi le famiglie senza gruppo"** puts every family without a group into one, the largest family first
  into the group with the fewest people, so the groups stay even; the families already in a group stay.
  Moving a family by hand is always possible: dragging it to another group, or back among those without one
  (on a touch screen after a short press; let go away from every list, it stays where it was), or from the
  menu next to its name. "Senza gruppo" stays as the place to drop it while the groups can change. The
  family moves at once and the change is saved: every page that shows the group (the history of the session, the feedback by group,
  the exports) reads the saved one.
- "Scarica i gruppi (CSV)" downloads one row per person, group by group with its leader, then the families
  without a group; "Genera PDF dei gruppi" has the same on paper, each group with its leader and size, then
  each family with its people (both audited). Saving a group or a leader sends no email and is audited.
- A family that declines or is removed leaves its group, and so does cancelling the session; a leader who
  declines or whose convocation is withdrawn leaves the group without one. A completed session keeps its
  groups, read-only. Families and staff do not see the groups of an open session; a family sees its own, with who led it, in
  the history of the session (3.3).

### 3.13 Feedback of the families

What the families said at the end of their session, year by year, administration only (`/admin/feedback`,
`?anno=` and `?vista=commenti|staff`). Three tabs:

- **Voti**: the questions with a vote from 1 to 5, for the year or one session. Each shows how its votes
  split into 5, 4 and 1-3 (a thin bar: 5 solid, 4 lighter, 1-3 in the warning colour; the percentages are in
  the text). Activities first, then reception, spaces and staff; the most liked first. Then the suggestions
  that came back from several families, when the year has them (an imported one).
- **Commenti**: the written answers question by question, with search and filters by session and question.
  Anonymous: a family is a number within its session.
- **Staff**: presences per session and the votes of the activities each person led, per person (open a
  person for the sessions) or per activity (the same activity session by session). It has names.

2026 comes from the pages the camp published (Nicola): `scripts/import-feedback.mjs <folder> --apply --by
<admin>` reads `feedback-2026.html`, `commenti-2026.html` and `staff-2026.html` and keeps the year whole in
`feedback_archives` (one row per year, `data` as `shared/types/feedback.ts`), audited (`feedback.import`). The
staff part is kept as turns (an activity in a session, who led it, its votes): a turn in pairs is one turn with
two names, and the import stops if their votes differ. The numbers are Nicola's (a vote given to two
activities done in one slot counts for both).

From 2027 the **end-of-session questionnaire** fills the same pages (`shared/content/feedback-form.ts`, the
questions of 2026 so that the years compare):

- It opens when the administration marks the session completed: the titolari who came (`confirmed`) receive
  `session.feedback` and find it in `/famiglia/sessioni` and at `/famiglia/questionario/:sessionId`; their home
  reminds them for 30 days. Families that declined, reserves and the other sessions' families cannot open it.
  It never opens in a year that was imported: the administration reads that year's archive, and answers there
  would never be seen.
- A vote from 1 to 5 for each activity of the session's programme (its copy, fixed when the session closes,
  with "Non fatta") and for information, reception, sensory room, staff and V-Team (with "Non so"); then six
  written questions. All optional, but at least one vote or answer; sent once, never changed
  (`feedback.submit` in the audit, with how many votes and answers, not their content). The page tells the
  family the answers reach the administration without its name.
- A year with no archive is read from the answers (`feedback_responses`, one row per family and session). A
  session's number is the one the calendar puts in its title ("Sessione 7 · …"), so it does not move when
  sessions are added, copied or deleted; the others follow by start date. A family is a number within its
  session in the order it answered; the suggestions summed up by the camp are not there.
- Staff: the people with an accepted convocation and the people the programme names in its group blocks
  ("Chiara e Marco", "Chiara ed Elisa" are two; a first name is matched to the session's staff when only one
  person has it, otherwise it stays as written). A turn is an activity in a session with the people who led it
  for some groups, and the votes of the families of those groups; a family without a group counts only when
  the whole activity had the same people.
- The demo seed has an invented 2025 (imported) and the answers of four families to the completed 2026
  session; famiglia@ has not answered yet.

### 3.14 Canteen

What the supplier of the meals needs for a session: the **Mensa** tab of the session.

- **Who eats**: every member of the families holding a place (their cards; a card still to fill in counts
  as its family) and the staff and v-team still in play (activeStaff). «Totale pasti» is the people at each
  meal, said by group, only the groups with someone: «60 di 12 famiglie, 10 dello staff e 2 del v-team».
  Families without cards are not counted until they fill in their data: the tab and the CSV name them, the
  text and the PDF for the supplier say how many.
- **Needs**: allergies and intolerances («senza lattosio», «senza glutine»…) and food preferences
  («vegetariana»…), each with how many and who, by name; then «Da sapere»: the food selectivity of the young
  people with a condition and the other notes. They come from «Informazioni utili» of the cards (3.8) and, for
  the staff, from their personal sheet (3.4, `staff_profiles.usefulInfo`, with a consent of their own: saving
  nothing withdraws it; «Altro da condividere» never reaches the canteen).
- «Genera PDF per il fornitore» (the primary action) downloads an A4 PDF: the session and its dates, «Totale
  pasti» with the groups, each need with how many and who by first and last name, then «Da sapere». «Copia il
  testo» copies «Totale pasti 72 (persone a ogni pasto: 60 di 12 famiglie, 10 dello staff e 2 del v-team) di
  cui: 5 senza lattosio (…)»; «Scarica CSV» downloads the same. Health data with names: administration only;
  reading and downloads are audited (`session.canteen_view`, `session.canteen_export`, with `format: 'pdf'`
  for the PDF).

## 4. Emails

**Daily limit.** At most 100 emails leave per day (`server/domain/email-quota.ts`), the quota of Resend's free plan.
Resend counts a UTC day, so the count restarts at 01:00 Italian time (02:00 in summer). If Resend refuses for its own
quota (received emails count there too, and the plan also stops at 3,000 a month), ordinary emails go back in the
queue. Ordinary emails use the first 80; the others wait in the queue (`email_log`, status `queued`), in order, and leave by themselves
from 8:00 to 20:00. The last 20 are kept for access emails (`sensitive`: links and codes), which expire and so never
wait: over 100 they are recorded as failed. At 23:59 whatever is left of the day goes to the queue. The admin sees
today's count, the expected departures and the queue in Comunicazioni, and the queue size in the Panoramica.

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
| `session.feedback` | session to `completed` (the end-of-session questionnaire, 3.13) | titolari confirmed |
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
  list shows the ages of the members with a condition (no names, no details), not in the CSV export; it
  can be filtered by how many there are, their age (5-10, 11-14, 15-18, 19-21, or none within 5-21, the
  rule of the age notice) and the type of
  condition («Tipologia»), which is never shown and whose use is audited (`family.health_filter`, and in
  `family.export`). The other filters: questionnaire status, region then province (the provinces of the
  region chosen), number of members.
- Files are never public: downloads go through an authorised endpoint (`/api/files/:id` or an area endpoint).
- Every list or detail endpoint checks the role and the ownership; ids from the client are never trusted.
- Sensitive actions are recorded in `audit_log` (status changes, reviews, signatures, account changes).
- Rate limits on sign-in, registration, reset and signature codes.
- Feedback (3.13): administration only. The comments are anonymous but may speak of the children; the staff
  part names people and their votes.

## 6. Not in sprint 1

The details of each card beyond name, birth date and relationship (sprint 2, still to define with the
camp), automatic reserve promotion, Resend delivery
webhooks, a qualified e-signature provider, Supabase (decided together: the app uses plain Postgres, so
moving there is a change of `DATABASE_URL` and of the file storage), multilingual interface, dark mode.
