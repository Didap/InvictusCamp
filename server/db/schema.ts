// The data model of the gestionale. Read it first. Column names are snake_case in the database
// (casing: 'snake_case' in drizzle.config.ts and server/utils/db.ts), camelCase here.
// Days are `date` columns in string mode ('YYYY-MM-DD', a day in Italy); instants are timestamptz.
import { relations, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { Audience, DisabilityInfo, FormAnswers, ProgrammeContent } from '../../shared/types/domain'
import type {
  ConvocationStatus,
  DocumentCategory,
  EmailStatus,
  FamilyFormStatus,
  FilePurpose,
  ItalianRegion,
  LodgingFeature,
  MemberKind,
  MemberRelationship,
  ParticipationKind,
  ParticipationStatus,
  PersonalDocumentCategory,
  ProgrammeGroup,
  SessionStatus,
  SignatureStatus,
  StaffRole,
  StaffStatus,
  StaffTeam,
  TokenPurpose,
  UserRole,
  UserStatus,
} from '../../shared/utils/constants'
import { OPEN_CONVOCATIONS } from '../../shared/utils/constants'
import { ACTIVE_STATUSES } from '../../shared/utils/slots'

const tz = { withTimezone: true } as const
const pk = () => uuid().primaryKey().defaultRandom()
const createdAt = () => timestamp(tz).notNull().defaultNow()
const updatedAt = () =>
  timestamp(tz)
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
const day = () => date({ mode: 'string' })

// ─── Accounts ──────────────────────────────────────────────────────────────────────────────────────

/** Every person who signs in: administration, families (the family's account) and staff. */
export const users = pgTable(
  'users',
  {
    id: pk(),
    /** Always lowercase. */
    email: text().notNull(),
    /** Null until an invited user chooses a password. */
    passwordHash: text(),
    role: text().$type<UserRole>().notNull(),
    status: text().$type<UserStatus>().notNull().default('active'),
    firstName: text().notNull(),
    lastName: text().notNull(),
    phone: text(),
    /** Self-registered accounts sign in only after confirming the address. */
    emailVerifiedAt: timestamp(tz),
    /** Sessions signed in before this instant are refused (server/utils/auth.ts). */
    passwordChangedAt: timestamp(tz),
    lastLoginAt: timestamp(tz),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('users_email_key').on(t.email), index('users_role_idx').on(t.role)],
)

/** One-time links sent by email (invite, address confirmation, password reset). Only the hash is kept. */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text().$type<TokenPurpose>().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp(tz).notNull(),
    usedAt: timestamp(tz),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('auth_tokens_hash_key').on(t.tokenHash), index('auth_tokens_user_idx').on(t.userId)],
)

// ─── Files ─────────────────────────────────────────────────────────────────────────────────────────

/** Every stored file. The bytes live in the uploads directory (server/utils/files.ts), never in a public URL. */
export const files = pgTable(
  'files',
  {
    id: pk(),
    storageKey: text().notNull(),
    originalName: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    purpose: text().$type<FilePurpose>().notNull(),
    /** Whose data this is (a family's or a staff member's account); null for documents of the administration. */
    ownerUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    uploadedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('files_storage_key').on(t.storageKey), index('files_owner_idx').on(t.ownerUserId)],
)

// ─── Families ──────────────────────────────────────────────────────────────────────────────────────

/** A family, signed in through one account (the referent). */
export const families = pgTable(
  'families',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** How the family is called in lists, e.g. "Famiglia Rossi". */
    name: text().notNull(),
    /** Residence: street and number. */
    address: text(),
    city: text(),
    /** CAP, five digits. */
    postalCode: text(),
    province: text(),
    region: text().$type<ItalianRegion>(),
    phone: text(),
    /** The questions of the family data (shared/content/family-form.ts), by question id. */
    formAnswers: jsonb().$type<FormAnswers>().notNull().default({}),
    formStatus: text().$type<FamilyFormStatus>().notNull().default('draft'),
    formSubmittedAt: timestamp(tz),
    /** Informativa privacy accepted. */
    privacyConsentAt: timestamp(tz),
    /** Explicit consent to the processing of health data (GDPR art. 9), required before disability details. */
    healthDataConsentAt: timestamp(tz),
    /** Internal notes of the administration; never shown to the family. */
    adminNotes: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('families_user_key').on(t.userId)],
)

export const familyMembers = pgTable(
  'family_members',
  {
    id: pk(),
    familyId: uuid()
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    /**
     * Name and relationship are null while the card is still to fill in: confirming the family data
     * creates one empty card per person declared (server/domain/families.ts, saveFamilyData).
     */
    firstName: text(),
    lastName: text(),
    birthDate: day(),
    relationship: text().$type<MemberRelationship>(),
    kind: text().$type<MemberKind>().notNull().default('adult'),
    /** The person the camp talks to. */
    isReferent: boolean().notNull().default(false),
    hasDisability: boolean().notNull().default(false),
    /** Special category data: family and administration only. */
    disability: jsonb().$type<DisabilityInfo>(),
    notes: text(),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [index('family_members_family_idx').on(t.familyId)],
)

// ─── Staff ─────────────────────────────────────────────────────────────────────────────────────────

/** The staff side of a staff account: the application (candidatura) and its review. */
export const staffProfiles = pgTable(
  'staff_profiles',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text().$type<StaffStatus>().notNull().default('registered'),
    /** Staff or v-team (volunteers): chosen in the application, changed by the administration. */
    team: text().$type<StaffTeam>().notNull().default('staff'),
    birthDate: day(),
    city: text(),
    roles: jsonb().$type<StaffRole[]>().notNull().default([]),
    qualifications: text(),
    experience: text(),
    motivation: text(),
    cvFileId: uuid().references(() => files.id, { onDelete: 'set null' }),
    appliedAt: timestamp(tz),
    reviewedAt: timestamp(tz),
    reviewedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Internal notes of the review; never shown to the candidate. */
    reviewNotes: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('staff_profiles_user_key').on(t.userId), index('staff_profiles_status_idx').on(t.status)],
)

// ─── Sessions ──────────────────────────────────────────────────────────────────────────────────────

/** A camp session (sessione): dates, places for families, staff needed. */
export const campSessions = pgTable(
  'camp_sessions',
  {
    id: pk(),
    title: text().notNull(),
    description: text(),
    location: text().notNull(),
    startDate: day().notNull(),
    endDate: day().notNull(),
    status: text().$type<SessionStatus>().notNull().default('draft'),
    /** Places for families (titolari). Reserves are not counted. */
    familySlots: integer().notNull(),
    staffNeeded: integer().notNull().default(0),
    /** Families answer the invitation by this day. */
    responseDeadline: day(),
    /** The contract staff members sign after accepting the convocation (optional). */
    contractDocumentId: uuid().references((): AnyPgColumn => documents.id, { onDelete: 'set null' }),
    /** Internal notes. */
    notes: text(),
    statusChangedAt: timestamp(tz),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    index('camp_sessions_start_idx').on(t.startDate),
    index('camp_sessions_status_idx').on(t.status),
    check('camp_sessions_range', sql`${t.endDate} >= ${t.startDate}`),
    check('camp_sessions_slots', sql`${t.familySlots} >= 0 and ${t.staffNeeded} >= 0`),
  ],
)

/**
 * A lodging of the camp (alloggio, docs/spec.md 3.11): the bed layout the administration enters once and
 * every session uses. A family in a session gets one (session_families.lodgingId).
 */
export const lodgings = pgTable(
  'lodgings',
  {
    id: pk(),
    name: text().notNull(),
    /** Where it is, to group the layout: "Corte A", "Primo piano". */
    area: text(),
    beds: integer().notNull(),
    features: jsonb().$type<LodgingFeature[]>().notNull().default([]),
    /** How the beds are made, e.g. "1 matrimoniale e 2 singoli". */
    description: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [check('lodgings_beds', sql`${t.beds} > 0`)],
)

/** A family in a session: titolare (slot) or riserva (reserve, called in reserveRank order). */
/** A titolare holding a place (shared/utils/slots.ts, holdsSlot): only it has a lodging and a group. */
const holdsPlace = (t: { kind: AnyPgColumn; status: AnyPgColumn }) =>
  sql`(${t.kind} = 'slot' and ${t.status} in (${sql.raw(ACTIVE_STATUSES.map(status => `'${status}'`).join(', '))}))`

export const sessionFamilies = pgTable(
  'session_families',
  {
    id: pk(),
    sessionId: uuid()
      .notNull()
      .references(() => campSessions.id, { onDelete: 'cascade' }),
    familyId: uuid()
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    kind: text().$type<ParticipationKind>().notNull(),
    /** Calling order among reserves, 1 first. Null for slots. */
    reserveRank: integer(),
    status: text().$type<ParticipationStatus>().notNull().default('selected'),
    invitedAt: timestamp(tz),
    respondedAt: timestamp(tz),
    declineReason: text(),
    /** Where the family sleeps; only while it holds a place (cleared when it declines or is removed). */
    lodgingId: uuid().references(() => lodgings.id, { onDelete: 'set null' }),
    /** The activity group of the family (docs/spec.md 3.12); like the lodging, only while it holds a place. */
    activityGroup: text().$type<ProgrammeGroup>(),
    /** Internal notes. */
    notes: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    uniqueIndex('session_families_session_family_key').on(t.sessionId, t.familyId),
    index('session_families_family_idx').on(t.familyId),
    // One family per lodging in a session; lodging first, for the lookups by lodging.
    uniqueIndex('session_families_lodging_session_key').on(t.lodgingId, t.sessionId),
    check('session_families_lodging', sql`${t.lodgingId} is null or ${holdsPlace(t)}`),
    check('session_families_activity_group', sql`${t.activityGroup} is null or ${holdsPlace(t)}`),
  ],
)

/** A staff or v-team member who can come to the whole of a session (docs/spec.md 3.5). */
export const sessionAvailability = pgTable(
  'session_availability',
  {
    id: pk(),
    sessionId: uuid()
      .notNull()
      .references(() => campSessions.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  t => [
    uniqueIndex('session_availability_session_user_key').on(t.sessionId, t.userId),
    index('session_availability_user_idx').on(t.userId),
  ],
)

/** A staff member convoked to a session. Confirmed = accepted and, if the session has a contract, signed. */
export const sessionStaff = pgTable(
  'session_staff',
  {
    id: pk(),
    sessionId: uuid()
      .notNull()
      .references(() => campSessions.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Role in this session. */
    role: text().$type<StaffRole>(),
    status: text().$type<ConvocationStatus>().notNull().default('draft'),
    /** Message sent with the convocation. */
    message: text(),
    sentAt: timestamp(tz),
    respondedAt: timestamp(tz),
    declineReason: text(),
    /** The activity group this person is responsible for (docs/spec.md 3.12): one per group. */
    activityGroup: text().$type<ProgrammeGroup>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    uniqueIndex('session_staff_session_user_key').on(t.sessionId, t.userId),
    index('session_staff_user_idx').on(t.userId),
    uniqueIndex('session_staff_activity_group_key').on(t.sessionId, t.activityGroup),
    // A convocation declined or withdrawn leads no group.
    check(
      'session_staff_activity_group',
      sql`${t.activityGroup} is null or ${t.status} in (${sql.raw(OPEN_CONVOCATIONS.map(status => `'${status}'`).join(', '))})`,
    ),
  ],
)

/**
 * The week programme (docs/spec.md 3.10): one per year (`year`), and the copy a session may have of it
 * (`sessionId`), never both. A session without a copy uses the programme of the year it starts in.
 * `revision` grows at every save: a save carrying an older one is refused (two people editing).
 */
export const programmes = pgTable(
  'programmes',
  {
    id: pk(),
    year: integer(),
    sessionId: uuid().references(() => campSessions.id, { onDelete: 'cascade' }),
    content: jsonb().$type<ProgrammeContent>().notNull(),
    revision: integer().notNull().default(1),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    uniqueIndex('programmes_year_key').on(t.year),
    uniqueIndex('programmes_session_key').on(t.sessionId),
    check('programmes_owner', sql`(${t.year} is null) <> (${t.sessionId} is null)`),
  ],
)

// ─── Documents and signatures ──────────────────────────────────────────────────────────────────────

/** A document uploaded by the administration (PDF), to read or to sign. */
export const documents = pgTable(
  'documents',
  {
    id: pk(),
    title: text().notNull(),
    description: text(),
    category: text().$type<DocumentCategory>().notNull(),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    requiresSignature: boolean().notNull().default(true),
    /** Set when the document belongs to one session (e.g. its contract). */
    sessionId: uuid().references((): AnyPgColumn => campSessions.id, { onDelete: 'set null' }),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    archivedAt: timestamp(tz),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [index('documents_session_idx').on(t.sessionId)],
)

/**
 * A document assigned to one person. Signing is a simple electronic signature (FES) confirmed by a
 * one-time code sent by email; the record keeps who, when, from where and the SHA-256 of the original.
 */
export const signatureRequests = pgTable(
  'signature_requests',
  {
    id: pk(),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid().references(() => campSessions.id, { onDelete: 'set null' }),
    status: text().$type<SignatureStatus>().notNull().default('pending'),
    dueDate: day(),
    requestedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    requestedAt: timestamp(tz).notNull().defaultNow(),
    remindedAt: timestamp(tz),
    otpHash: text(),
    otpExpiresAt: timestamp(tz),
    otpAttempts: integer().notNull().default(0),
    signedAt: timestamp(tz),
    /** Full name typed by the signer. */
    signedName: text(),
    signedIp: text(),
    signedUserAgent: text(),
    /** SHA-256 of the original file at the moment of signing. */
    documentSha256: text(),
    /** The original with the signature certificate page appended. */
    signedFileId: uuid().references(() => files.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    uniqueIndex('signature_requests_document_user_key').on(t.documentId, t.userId),
    index('signature_requests_user_idx').on(t.userId),
    index('signature_requests_status_idx').on(t.status),
  ],
)

/** Documents uploaded by a family or a staff member (certificates, IDs, diagnoses, titles). */
export const personalDocuments = pgTable(
  'personal_documents',
  {
    id: pk(),
    /** The account the document belongs to. */
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyMemberId: uuid().references(() => familyMembers.id, { onDelete: 'set null' }),
    category: text().$type<PersonalDocumentCategory>().notNull(),
    title: text().notNull(),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    notes: text(),
    uploadedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  t => [index('personal_documents_user_idx').on(t.userId)],
)

// ─── Communications ────────────────────────────────────────────────────────────────────────────────

/** A message written in the dashboard and sent to an audience. */
export const communications = pgTable(
  'communications',
  {
    id: pk(),
    subject: text().notNull(),
    /** Plain text; blank lines separate paragraphs. */
    body: text().notNull(),
    audience: jsonb().$type<Audience>().notNull(),
    sessionId: uuid().references(() => campSessions.id, { onDelete: 'set null' }),
    recipientCount: integer().notNull().default(0),
    sentBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    sentAt: timestamp(tz),
    createdAt: createdAt(),
  },
  t => [index('communications_session_idx').on(t.sessionId)],
)

/**
 * A saved message the composer starts from ("Convocazione staff"). Subject and body may hold the fields
 * filled for each recipient ({nome}, {sessione}, {date}) and parts in square brackets to complete by hand.
 */
export const messageTemplates = pgTable('message_templates', {
  id: pk(),
  name: text().notNull(),
  subject: text().notNull(),
  /** Plain text; blank lines separate paragraphs. */
  body: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/** Every email the platform sends (or simulates), automatic or from a communication. */
export const emailLog = pgTable(
  'email_log',
  {
    id: pk(),
    /** Template key, e.g. 'auth.invite', 'session.invite', 'communication'. */
    template: text().notNull(),
    toEmail: text().notNull(),
    toUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    subject: text().notNull(),
    /** The HTML sent; null for emails that carry access links or codes. */
    html: text(),
    status: text().$type<EmailStatus>().notNull(),
    providerId: text(),
    error: text(),
    communicationId: uuid().references(() => communications.id, { onDelete: 'set null' }),
    sessionId: uuid().references(() => campSessions.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  t => [
    index('email_log_created_idx').on(t.createdAt),
    index('email_log_user_idx').on(t.toUserId),
    index('email_log_communication_idx').on(t.communicationId),
    index('email_log_session_idx').on(t.sessionId),
  ],
)

// ─── Audit ─────────────────────────────────────────────────────────────────────────────────────────

/** Sensitive actions: status changes, reviews, signatures, health data changes, account changes. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: pk(),
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** e.g. 'session.status', 'staff.review', 'signature.sign', 'member.health_update'. */
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    data: jsonb().$type<Record<string, unknown>>(),
    ip: text(),
    createdAt: createdAt(),
  },
  t => [index('audit_log_created_idx').on(t.createdAt), index('audit_log_entity_idx').on(t.entityType, t.entityId)],
)

// ─── Relations (for db.query.<table>.findMany({ with })) ───────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  family: one(families, { fields: [users.id], references: [families.userId] }),
  staffProfile: one(staffProfiles, { fields: [users.id], references: [staffProfiles.userId] }),
  availability: many(sessionAvailability),
  convocations: many(sessionStaff),
  signatureRequests: many(signatureRequests),
  personalDocuments: many(personalDocuments),
}))

export const familiesRelations = relations(families, ({ one, many }) => ({
  user: one(users, { fields: [families.userId], references: [users.id] }),
  members: many(familyMembers),
  participations: many(sessionFamilies),
}))

export const familyMembersRelations = relations(familyMembers, ({ one }) => ({
  family: one(families, { fields: [familyMembers.familyId], references: [families.id] }),
}))

export const staffProfilesRelations = relations(staffProfiles, ({ one }) => ({
  user: one(users, { fields: [staffProfiles.userId], references: [users.id] }),
  cvFile: one(files, { fields: [staffProfiles.cvFileId], references: [files.id] }),
}))

export const campSessionsRelations = relations(campSessions, ({ one, many }) => ({
  families: many(sessionFamilies),
  staff: many(sessionStaff),
  availability: many(sessionAvailability),
  documents: many(documents),
  contractDocument: one(documents, { fields: [campSessions.contractDocumentId], references: [documents.id] }),
}))

export const sessionFamiliesRelations = relations(sessionFamilies, ({ one }) => ({
  session: one(campSessions, { fields: [sessionFamilies.sessionId], references: [campSessions.id] }),
  family: one(families, { fields: [sessionFamilies.familyId], references: [families.id] }),
}))

export const sessionStaffRelations = relations(sessionStaff, ({ one }) => ({
  session: one(campSessions, { fields: [sessionStaff.sessionId], references: [campSessions.id] }),
  user: one(users, { fields: [sessionStaff.userId], references: [users.id] }),
}))

export const sessionAvailabilityRelations = relations(sessionAvailability, ({ one }) => ({
  session: one(campSessions, { fields: [sessionAvailability.sessionId], references: [campSessions.id] }),
  user: one(users, { fields: [sessionAvailability.userId], references: [users.id] }),
}))

export const documentsRelations = relations(documents, ({ one, many }) => ({
  file: one(files, { fields: [documents.fileId], references: [files.id] }),
  session: one(campSessions, { fields: [documents.sessionId], references: [campSessions.id] }),
  requests: many(signatureRequests),
}))

export const signatureRequestsRelations = relations(signatureRequests, ({ one }) => ({
  document: one(documents, { fields: [signatureRequests.documentId], references: [documents.id] }),
  user: one(users, { fields: [signatureRequests.userId], references: [users.id] }),
  session: one(campSessions, { fields: [signatureRequests.sessionId], references: [campSessions.id] }),
  signedFile: one(files, { fields: [signatureRequests.signedFileId], references: [files.id] }),
}))

export const personalDocumentsRelations = relations(personalDocuments, ({ one }) => ({
  user: one(users, { fields: [personalDocuments.userId], references: [users.id] }),
  member: one(familyMembers, { fields: [personalDocuments.familyMemberId], references: [familyMembers.id] }),
  file: one(files, { fields: [personalDocuments.fileId], references: [files.id] }),
}))

export const communicationsRelations = relations(communications, ({ one, many }) => ({
  session: one(campSessions, { fields: [communications.sessionId], references: [campSessions.id] }),
  emails: many(emailLog),
}))

export const emailLogRelations = relations(emailLog, ({ one }) => ({
  communication: one(communications, { fields: [emailLog.communicationId], references: [communications.id] }),
}))
