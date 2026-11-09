// Demo data for development (POST /api/dev/seed, scripts/dev-seed.mjs). Every person, family and
// document is invented; health details are placeholders marked "(esempio)". Dates are fixed around the
// 2026 and 2027 summer seasons.
import { sql } from 'drizzle-orm'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { DisabilityInfo, FormAnswers } from '../../shared/types/domain'
import type {
  ConvocationStatus,
  MemberRelationship,
  ParticipationKind,
  ParticipationStatus,
  StaffRole,
  ItalianRegion,
  StaffStatus,
} from '../../shared/utils/constants'
import { programmeTemplate } from '../../shared/content/programme-template'
import { DEFAULT_LOCATION } from '../../shared/utils/constants'
import * as t from '../db/schema'
import type { Db } from './db'
import { storeFile } from './storage'

export const DEMO_PASSWORD = 'invictus-demo'

export const DEMO_ACCOUNTS = {
  admin: 'admin@invictuscamp.local',
  family: 'famiglia@invictuscamp.local',
  staff: 'staff@invictuscamp.local',
  candidate: 'candidato@invictuscamp.local',
} as const

const TABLES = [
  'audit_log',
  'email_log',
  'communications',
  'personal_documents',
  'signature_requests',
  'session_staff',
  'session_families',
  'documents',
  'programmes',
  'camp_sessions',
  'staff_availability',
  'staff_profiles',
  'family_members',
  'families',
  'files',
  'auth_tokens',
  'users',
]

/** Empties every table. Development and tests only. */
export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql.raw(`truncate table ${TABLES.join(', ')} restart identity cascade`))
}

interface DemoMember {
  firstName: string
  relationship: MemberRelationship
  birthDate?: string
  disability?: string
}

const FAMILIES: {
  first: string
  last: string
  email?: string
  city: string
  province: string
  submitted: boolean
  members: DemoMember[]
}[] = [
  {
    first: 'Anna',
    last: 'Rossi',
    email: DEMO_ACCOUNTS.family,
    city: 'Taranto',
    province: 'TA',
    submitted: true,
    members: [
      { firstName: 'Luca', relationship: 'parent' },
      {
        firstName: 'Matteo',
        relationship: 'child',
        birthDate: '2015-04-12',
        disability: 'Disturbo dello spettro autistico (esempio)',
      },
      { firstName: 'Sofia', relationship: 'child', birthDate: '2018-09-30' },
    ],
  },
  {
    first: 'Giovanna',
    last: 'Esposito',
    city: 'Lecce',
    province: 'LE',
    submitted: true,
    members: [
      {
        firstName: 'Pietro',
        relationship: 'child',
        birthDate: '2014-02-03',
        disability: 'Paralisi cerebrale infantile (esempio)',
      },
    ],
  },
  {
    first: 'Francesca',
    last: 'Greco',
    city: 'Brindisi',
    province: 'BR',
    submitted: true,
    members: [
      { firstName: 'Nicola', relationship: 'parent' },
      {
        firstName: 'Alessia',
        relationship: 'child',
        birthDate: '2016-06-21',
        disability: 'Sindrome di Down (esempio)',
      },
    ],
  },
  {
    first: 'Antonio',
    last: 'De Luca',
    city: 'Bari',
    province: 'BA',
    submitted: true,
    members: [
      { firstName: 'Marta', relationship: 'parent' },
      {
        firstName: 'Samuele',
        relationship: 'child',
        birthDate: '2013-11-08',
        disability: 'Distrofia muscolare (esempio)',
      },
      { firstName: 'Giorgia', relationship: 'child', birthDate: '2011-01-17' },
    ],
  },
  {
    first: 'Rosa',
    last: 'Lombardi',
    city: 'Manduria',
    province: 'TA',
    submitted: true,
    members: [
      { firstName: 'Davide', relationship: 'child', birthDate: '2017-03-14', disability: 'Epilessia (esempio)' },
    ],
  },
  {
    first: 'Salvatore',
    last: 'Marino',
    city: 'Matera',
    province: 'MT',
    submitted: true,
    members: [
      { firstName: 'Carla', relationship: 'parent' },
      { firstName: 'Emma', relationship: 'child', birthDate: '2015-08-02', disability: 'Fibrosi cistica (esempio)' },
    ],
  },
  {
    first: 'Elena',
    last: 'Ferrara',
    city: 'Potenza',
    province: 'PZ',
    submitted: true,
    members: [
      {
        firstName: 'Tommaso',
        relationship: 'child',
        birthDate: '2012-05-27',
        disability: 'Disabilità intellettiva (esempio)',
      },
    ],
  },
  {
    first: 'Davide',
    last: 'Colombo',
    city: 'Napoli',
    province: 'NA',
    submitted: true,
    members: [
      { firstName: 'Irene', relationship: 'parent' },
      {
        firstName: 'Leonardo',
        relationship: 'child',
        birthDate: '2016-12-09',
        disability: 'Sindrome di Rett (esempio)',
      },
    ],
  },
  {
    first: 'Teresa',
    last: 'Ricci',
    city: 'Foggia',
    province: 'FG',
    submitted: true,
    members: [
      {
        firstName: 'Beatrice',
        relationship: 'child',
        birthDate: '2014-07-19',
        disability: 'Atrofia muscolare spinale (esempio)',
      },
    ],
  },
  {
    first: 'Michele',
    last: 'Romano',
    city: 'Cosenza',
    province: 'CS',
    submitted: true,
    members: [
      { firstName: 'Paola', relationship: 'parent' },
      {
        firstName: 'Riccardo',
        relationship: 'child',
        birthDate: '2013-04-30',
        disability: 'Diabete di tipo 1 (esempio)',
      },
    ],
  },
  {
    first: 'Lucia',
    last: 'Caputo',
    city: 'Gallipoli',
    province: 'LE',
    submitted: false,
    members: [
      {
        firstName: 'Gabriele',
        relationship: 'child',
        birthDate: '2018-02-11',
        disability: 'Sindrome dell’X fragile (esempio)',
      },
    ],
  },
  { first: 'Giuseppe', last: 'Santoro', city: 'Martina Franca', province: 'TA', submitted: false, members: [] },
]

const STAFF: {
  first: string
  last: string
  email?: string
  status: StaffStatus
  roles: StaffRole[]
  city: string
  availability: [string, string][]
}[] = [
  {
    first: 'Chiara',
    last: 'Bianchi',
    email: DEMO_ACCOUNTS.staff,
    status: 'approved',
    roles: ['group_lead'],
    city: 'Lecce',
    availability: [['2027-06-15', '2027-07-31']],
  },
  {
    first: 'Paolo',
    last: 'Gallo',
    email: DEMO_ACCOUNTS.candidate,
    status: 'applied',
    roles: ['activity_lead'],
    city: 'Taranto',
    availability: [],
  },
  {
    first: 'Martina',
    last: 'Conti',
    status: 'approved',
    roles: ['group_lead'],
    city: 'Bari',
    availability: [['2027-06-20', '2027-06-30']],
  },
  {
    first: 'Andrea',
    last: 'Fontana',
    status: 'approved',
    roles: ['activity_lead'],
    city: 'Brindisi',
    availability: [['2027-06-24', '2027-07-20']],
  },
  {
    first: 'Serena',
    last: 'Barbieri',
    status: 'approved',
    roles: ['activity_lead'],
    city: 'Lecce',
    availability: [['2027-08-01', '2027-09-30']],
  },
  {
    first: 'Lorenzo',
    last: 'Moretti',
    status: 'approved',
    roles: ['activity_lead', 'other'],
    city: 'Taranto',
    availability: [['2027-06-01', '2027-09-30']],
  },
  {
    first: 'Federica',
    last: 'Rinaldi',
    status: 'approved',
    roles: ['group_lead'],
    city: 'Grottaglie',
    availability: [['2027-06-21', '2027-06-27']],
  },
  {
    first: 'Simone',
    last: 'Caruso',
    status: 'approved',
    roles: ['group_lead'],
    city: 'Ostuni',
    availability: [['2027-07-01', '2027-07-31']],
  },
  { first: 'Ilaria', last: 'Ferri', status: 'applied', roles: ['activity_lead'], city: 'Bari', availability: [] },
  { first: 'Gabriele', last: 'Testa', status: 'rejected', roles: ['other'], city: 'Lecce', availability: [] },
  { first: 'Noemi', last: 'Pellegrini', status: 'registered', roles: [], city: 'Taranto', availability: [] },
]

const DEMO_ANSWERS: FormAnswers = {
  howDidYouHear: 'Associazione o ente',
  association: 'Associazione Insieme (esempio)',
  sessionPreferences: ['Sessioni nel weekend (2 notti)', 'Sessioni settimanali estive (4 notti)'],
  accommodationNeeds: ['Bagno senza barriere architettoniche'],
}

/** Region and CAP of the main town of each province of the demo families. */
const DEMO_PROVINCES: Record<string, { region: ItalianRegion; postalCode: string }> = {
  BA: { region: 'Puglia', postalCode: '70121' },
  BR: { region: 'Puglia', postalCode: '72100' },
  CS: { region: 'Calabria', postalCode: '87100' },
  FG: { region: 'Puglia', postalCode: '71121' },
  LE: { region: 'Puglia', postalCode: '73100' },
  MT: { region: 'Basilicata', postalCode: '75100' },
  NA: { region: 'Campania', postalCode: '80121' },
  PZ: { region: 'Basilicata', postalCode: '85100' },
  TA: { region: 'Puglia', postalCode: '74121' },
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
}

/** A one-page PDF with a title and some paragraphs. */
async function demoPdf(title: string, paragraphs: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  pdf.setAuthor('Invictus Camp')
  pdf.setCreator('Gestionale Invictus Camp (documento di esempio)')
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  page.drawText('Invictus Camp', { x: 56, y: 780, size: 11, font: bold, color: rgb(0.114, 0.373, 0.69) })
  page.drawText(title, { x: 56, y: 748, size: 17, font: bold, color: rgb(0.12, 0.11, 0.1) })
  let y = 712
  for (const text of paragraphs) {
    const words = text.split(' ')
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, 11) > 480) {
        page.drawText(line, { x: 56, y, size: 11, font })
        y -= 16
        line = word
      } else line = next
    }
    if (line) page.drawText(line, { x: 56, y, size: 11, font })
    y -= 26
  }
  page.drawText('Documento di esempio generato dal gestionale: non ha valore.', {
    x: 56,
    y: 48,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  })
  return pdf.save()
}

const LOREM = [
  'Il presente documento è un esempio generato per provare il gestionale di Invictus Camp. Il testo definitivo sarà fornito dall’amministrazione del camp.',
  'Le parti si impegnano a rispettare le regole del camp, la riservatezza delle informazioni sulle famiglie ospiti e le indicazioni del personale.',
  'Firmando questo documento si dichiara di averlo letto per intero e di accettarne il contenuto.',
]

export interface SeedSummary {
  users: number
  families: number
  staff: number
  sessions: number
  documents: number
  accounts: typeof DEMO_ACCOUNTS
  password: string
}

/** Fills an empty database with a believable season. */
export async function seedDemo(db: Db, options: { passwordHash: string; uploadsDir: string }): Promise<SeedSummary> {
  const verified = new Date('2026-09-01T09:00:00Z')
  const createUser = async (
    values: Pick<typeof t.users.$inferInsert, 'email' | 'role' | 'firstName' | 'lastName'> & { phone?: string },
  ) => {
    const [row] = await db
      .insert(t.users)
      .values({ status: 'active', emailVerifiedAt: verified, passwordHash: options.passwordHash, ...values })
      .returning()
    return row!
  }
  const pdfFile = async (
    name: string,
    title: string,
    purpose: 'document' | 'personal_document' | 'cv',
    ownerUserId: string | null,
    uploadedBy: string | null,
  ) =>
    storeFile(db, options.uploadsDir, {
      data: await demoPdf(title, LOREM),
      originalName: `${name}.pdf`,
      mimeType: 'application/pdf',
      purpose,
      ownerUserId,
      uploadedBy,
    })

  // Administration
  const admin = await createUser({ email: DEMO_ACCOUNTS.admin, role: 'admin', firstName: 'Giulia', lastName: 'Conte' })
  await createUser({
    email: 'marco.desantis@invictuscamp.local',
    role: 'admin',
    firstName: 'Marco',
    lastName: 'De Santis',
  })

  // Families
  const families: { userId: string; familyId: string; email: string; firstName: string }[] = []
  for (const [index, f] of FAMILIES.entries()) {
    const phone = `+39 3${String(20 + index).padStart(2, '0')} 555 01${String(index).padStart(2, '0')}`
    const user = await createUser({
      email: f.email ?? `${slug(f.last)}@demo.invictuscamp.local`,
      role: 'family',
      firstName: f.first,
      lastName: f.last,
      phone,
    })
    const [family] = await db
      .insert(t.families)
      .values({
        userId: user.id,
        name: `Famiglia ${f.last}`,
        address: f.submitted ? 'Via Roma 1 (esempio)' : null,
        city: f.city,
        province: f.province,
        ...(f.submitted ? DEMO_PROVINCES[f.province] : {}),
        phone,
        formAnswers: f.submitted ? DEMO_ANSWERS : {},
        formStatus: f.submitted ? 'submitted' : 'draft',
        formSubmittedAt: f.submitted ? new Date('2026-10-02T10:00:00Z') : null,
        privacyConsentAt: verified,
        healthDataConsentAt: f.members.some(m => m.disability) ? verified : null,
      })
      .returning({ id: t.families.id })
    const members: DemoMember[] = [{ firstName: f.first, relationship: 'parent' }, ...f.members]
    await db.insert(t.familyMembers).values(
      members.map((m, position) => ({
        familyId: family!.id,
        firstName: m.firstName,
        lastName: f.last,
        relationship: m.relationship,
        kind: m.relationship === 'child' || m.relationship === 'sibling' ? ('young' as const) : ('adult' as const),
        birthDate: m.birthDate ?? null,
        isReferent: position === 0,
        hasDisability: Boolean(m.disability),
        disability: m.disability
          ? ({
              description: m.disability,
              supportNeeds: 'Supporto nelle autonomie quotidiane (esempio).',
            } satisfies DisabilityInfo)
          : null,
        position,
      })),
    )
    families.push({ userId: user.id, familyId: family!.id, email: user.email, firstName: user.firstName })
  }

  // Staff
  const staff: { userId: string; email: string; firstName: string; status: StaffStatus }[] = []
  for (const [index, s] of STAFF.entries()) {
    const user = await createUser({
      email: s.email ?? `${slug(`${s.first} ${s.last}`)}@demo.invictuscamp.local`,
      role: 'staff',
      firstName: s.first,
      lastName: s.last,
      phone: `+39 34${index} 555 02${String(index).padStart(2, '0')}`,
    })
    const applied = s.status !== 'registered'
    const cv = applied
      ? await pdfFile(`CV ${s.first} ${s.last}`, `Curriculum di ${s.first} ${s.last}`, 'cv', user.id, user.id)
      : null
    await db.insert(t.staffProfiles).values({
      userId: user.id,
      status: s.status,
      city: s.city,
      birthDate: `199${index % 10}-0${(index % 9) + 1}-1${index % 9}`,
      roles: s.roles,
      qualifications: applied ? 'Laurea e attestati del settore (esempio).' : null,
      experience: applied
        ? 'Esperienze con bambini e ragazzi con disabilità in centri estivi e associazioni (esempio).'
        : null,
      motivation: applied ? 'Voglio contribuire a un’estate inclusiva per le famiglie del camp (esempio).' : null,
      cvFileId: cv?.id ?? null,
      appliedAt: applied ? new Date('2026-10-05T09:00:00Z') : null,
      reviewedAt: s.status === 'approved' || s.status === 'rejected' ? new Date('2026-10-12T09:00:00Z') : null,
      reviewedBy: s.status === 'approved' || s.status === 'rejected' ? admin.id : null,
    })
    if (s.availability.length) {
      await db
        .insert(t.staffAvailability)
        .values(s.availability.map(([startDate, endDate]) => ({ userId: user.id, startDate, endDate })))
    }
    staff.push({ userId: user.id, email: user.email, firstName: user.firstName, status: s.status })
  }

  // Sessions
  const session = async (values: Omit<typeof t.campSessions.$inferInsert, 'location' | 'createdBy'>) => {
    const [row] = await db
      .insert(t.campSessions)
      .values({ location: DEFAULT_LOCATION, createdBy: admin.id, ...values })
      .returning()
    return row!
  }
  const past = await session({
    title: 'Sessione estiva 2026',
    startDate: '2026-07-13',
    endDate: '2026-07-19',
    status: 'completed',
    familySlots: 6,
    staffNeeded: 6,
    responseDeadline: '2026-06-10',
    statusChangedAt: new Date('2026-07-20T08:00:00Z'),
  })
  const cancelled = await session({
    title: 'Sessione di settembre 2026',
    startDate: '2026-09-07',
    endDate: '2026-09-13',
    status: 'cancelled',
    familySlots: 6,
    staffNeeded: 6,
    statusChangedAt: new Date('2026-08-10T08:00:00Z'),
  })
  const june = await session({
    title: 'Sessione 1 · Giugno 2027',
    description: 'Prima sessione della stagione 2027.',
    startDate: '2027-06-21',
    endDate: '2027-06-27',
    status: 'inviting',
    familySlots: 6,
    staffNeeded: 8,
    responseDeadline: '2027-05-15',
    statusChangedAt: new Date('2026-10-25T09:00:00Z'),
  })
  const july = await session({
    title: 'Sessione 2 · Luglio 2027',
    startDate: '2027-07-12',
    endDate: '2027-07-18',
    status: 'draft',
    familySlots: 8,
    staffNeeded: 10,
    responseDeadline: '2027-06-10',
  })
  // The 2027 programme, from the model week: every 2027 session uses it.
  await db.insert(t.programmes).values({ year: 2027, content: programmeTemplate() })
  await session({
    title: 'Sessione 3 · Settembre 2027',
    startDate: '2027-09-06',
    endDate: '2027-09-12',
    status: 'draft',
    familySlots: 8,
    staffNeeded: 10,
  })

  const participate = async (
    sessionId: string,
    rows: [number, ParticipationKind, ParticipationStatus, number?][],
    invitedAt?: Date,
  ) => {
    await db.insert(t.sessionFamilies).values(
      rows.map(([familyIndex, kind, status, reserveRank]) => ({
        sessionId,
        familyId: families[familyIndex]!.familyId,
        kind,
        status,
        reserveRank: kind === 'reserve' ? (reserveRank ?? 1) : null,
        invitedAt: status === 'selected' ? null : (invitedAt ?? null),
        respondedAt:
          status === 'confirmed' || status === 'declined'
            ? new Date((invitedAt ?? verified).getTime() + 3 * 86_400_000)
            : null,
        declineReason: status === 'declined' ? 'Impegni familiari in quel periodo (esempio).' : null,
      })),
    )
  }
  await participate(
    past.id,
    [
      [0, 'slot', 'confirmed'],
      [1, 'slot', 'confirmed'],
      [2, 'slot', 'confirmed'],
      [3, 'slot', 'confirmed'],
      [4, 'slot', 'confirmed'],
      [5, 'slot', 'declined'],
      [6, 'reserve', 'cancelled', 1],
    ],
    new Date('2026-05-20T09:00:00Z'),
  )
  await participate(
    cancelled.id,
    [
      [7, 'slot', 'cancelled'],
      [8, 'slot', 'cancelled'],
    ],
    new Date('2026-07-01T09:00:00Z'),
  )
  await participate(
    june.id,
    [
      [0, 'slot', 'invited'],
      [1, 'slot', 'confirmed'],
      [2, 'slot', 'confirmed'],
      [3, 'slot', 'confirmed'],
      [4, 'slot', 'invited'],
      [5, 'slot', 'declined'],
      [6, 'reserve', 'invited', 1],
      [7, 'reserve', 'invited', 2],
      [8, 'reserve', 'invited', 3],
    ],
    new Date('2026-10-25T09:00:00Z'),
  )
  await participate(july.id, [
    [9, 'slot', 'selected'],
    [10, 'slot', 'selected'],
    [11, 'slot', 'selected'],
    [0, 'slot', 'selected'],
    [1, 'reserve', 'selected', 1],
  ])

  const byName = (first: string) => staff.find(s => s.firstName === first)!
  const convoke = async (sessionId: string, rows: [string, ConvocationStatus, StaffRole][]) => {
    await db.insert(t.sessionStaff).values(
      rows.map(([first, status, role]) => ({
        sessionId,
        userId: byName(first).userId,
        role,
        status,
        sentAt: status === 'draft' ? null : new Date('2026-10-28T09:00:00Z'),
        respondedAt: status === 'accepted' || status === 'declined' ? new Date('2026-10-30T09:00:00Z') : null,
        message: status === 'draft' ? null : 'Ti aspettiamo al camp per la prima sessione della stagione.',
      })),
    )
  }
  await convoke(past.id, [
    ['Chiara', 'accepted', 'group_lead'],
    ['Martina', 'accepted', 'group_lead'],
    ['Lorenzo', 'accepted', 'activity_lead'],
  ])
  await convoke(june.id, [
    ['Chiara', 'sent', 'group_lead'],
    ['Martina', 'accepted', 'group_lead'],
    ['Andrea', 'accepted', 'activity_lead'],
    ['Serena', 'declined', 'activity_lead'],
    ['Lorenzo', 'accepted', 'activity_lead'],
    ['Federica', 'draft', 'group_lead'],
    ['Simone', 'sent', 'group_lead'],
  ])
  await convoke(july.id, [
    ['Andrea', 'draft', 'activity_lead'],
    ['Simone', 'draft', 'group_lead'],
  ])

  // Documents to read and sign
  const document = async (
    title: string,
    category: typeof t.documents.$inferInsert.category,
    sessionId: string | null,
  ) => {
    const file = await pdfFile(title, title, 'document', null, admin.id)
    const [row] = await db
      .insert(t.documents)
      .values({ title, category, fileId: file.id, sessionId, requiresSignature: true, createdBy: admin.id })
      .returning()
    return { ...row!, sha256: file.sha256 }
  }
  const contract = await document('Contratto di collaborazione · Sessione 1 2027', 'contract', june.id)
  await db
    .update(t.campSessions)
    .set({ contractDocumentId: contract.id })
    .where(sql`${t.campSessions.id} = ${june.id}`)
  const regulation = await document('Regolamento del camp 2027', 'regulation', null)
  const privacy = await document('Informativa privacy e consenso al trattamento dei dati', 'privacy', null)
  const conduct = await document('Codice di condotta dello staff', 'regulation', null)

  const ask = async (
    doc: { id: string; sha256: string },
    rows: [string, boolean][],
    sessionId: string | null = null,
  ) => {
    await db.insert(t.signatureRequests).values(
      rows.map(([userId, signed]) => ({
        documentId: doc.id,
        userId,
        sessionId,
        requestedBy: admin.id,
        requestedAt: new Date('2026-10-26T09:00:00Z'),
        dueDate: '2027-05-31',
        status: signed ? ('signed' as const) : ('pending' as const),
        ...(signed
          ? {
              signedAt: new Date('2026-10-29T18:30:00Z'),
              signedName: 'Firma di esempio',
              signedIp: '127.0.0.1',
              signedUserAgent: 'dati di esempio',
              documentSha256: doc.sha256,
            }
          : {}),
      })),
    )
  }
  await ask(
    contract,
    [
      [byName('Martina').userId, true],
      [byName('Lorenzo').userId, true],
      [byName('Andrea').userId, false],
    ],
    june.id,
  )
  await ask(
    regulation,
    [
      [families[0]!.userId, false],
      [families[1]!.userId, true],
      [families[2]!.userId, true],
      [families[3]!.userId, false],
      [families[4]!.userId, false],
    ],
    june.id,
  )
  await ask(
    privacy,
    families.slice(0, 6).map((f, i) => [f.userId, i > 0 && i < 4]),
  )
  await ask(
    conduct,
    staff.filter(s => s.status === 'approved').map(s => [s.userId, s.firstName === 'Martina']),
  )

  // Documents uploaded by a family and by staff
  const rossi = families[0]!
  const [matteo] = await db
    .select({ id: t.familyMembers.id })
    .from(t.familyMembers)
    .where(sql`${t.familyMembers.firstName} = 'Matteo'`)
    .limit(1)
  const certificate = await pdfFile(
    'Certificato medico Matteo',
    'Certificato medico (esempio)',
    'personal_document',
    rossi.userId,
    rossi.userId,
  )
  await db.insert(t.personalDocuments).values({
    userId: rossi.userId,
    familyMemberId: matteo?.id ?? null,
    category: 'medical_certificate',
    title: 'Certificato medico di Matteo',
    fileId: certificate.id,
    uploadedBy: rossi.userId,
  })
  const chiara = byName('Chiara')
  const blsd = await pdfFile(
    'Attestato BLSD',
    'Attestato BLSD (esempio)',
    'personal_document',
    chiara.userId,
    chiara.userId,
  )
  await db.insert(t.personalDocuments).values({
    userId: chiara.userId,
    category: 'certification',
    title: 'Attestato BLSD',
    fileId: blsd.id,
    uploadedBy: chiara.userId,
  })

  // A communication and the emails already sent
  const [welcome] = await db
    .insert(t.communications)
    .values({
      subject: 'Le iscrizioni per l’estate 2027 sono aperte',
      body: 'Care famiglie,\n\nsono aperte le iscrizioni per le sessioni dell’estate 2027. Completate i dati della famiglia nel gestionale: vi contatteremo noi per le sessioni.\n\nA presto,\nlo staff di Invictus Camp',
      audience: { type: 'all_families' },
      recipientCount: families.length,
      sentBy: admin.id,
      sentAt: new Date('2026-10-20T09:00:00Z'),
    })
    .returning({ id: t.communications.id })
  await db.insert(t.emailLog).values([
    ...families.map(f => ({
      template: 'communication',
      toEmail: f.email,
      toUserId: f.userId,
      subject: 'Le iscrizioni per l’estate 2027 sono aperte',
      status: 'simulated' as const,
      communicationId: welcome!.id,
      createdAt: new Date('2026-10-20T09:00:00Z'),
    })),
    ...[0, 1, 2, 3, 4, 5].map(i => ({
      template: 'session.invite',
      toEmail: families[i]!.email,
      toUserId: families[i]!.userId,
      subject: 'Invito: Sessione 1 · Giugno 2027',
      status: 'simulated' as const,
      sessionId: june.id,
      createdAt: new Date('2026-10-25T09:00:00Z'),
    })),
    ...[6, 7, 8].map(i => ({
      template: 'session.reserve',
      toEmail: families[i]!.email,
      toUserId: families[i]!.userId,
      subject: 'Lista di riserva: Sessione 1 · Giugno 2027',
      status: 'simulated' as const,
      sessionId: june.id,
      createdAt: new Date('2026-10-25T09:00:00Z'),
    })),
  ])
  await db.insert(t.auditLog).values([
    {
      actorUserId: admin.id,
      action: 'session.status',
      entityType: 'session',
      entityId: june.id,
      data: { from: 'draft', to: 'inviting' },
      createdAt: new Date('2026-10-25T09:00:00Z'),
    },
    {
      actorUserId: admin.id,
      action: 'session.status',
      entityType: 'session',
      entityId: past.id,
      data: { from: 'confirmed', to: 'completed' },
      createdAt: new Date('2026-07-20T08:00:00Z'),
    },
  ])

  return {
    users: 2 + families.length + staff.length,
    families: families.length,
    staff: staff.length,
    sessions: 5,
    documents: 4,
    accounts: DEMO_ACCOUNTS,
    password: DEMO_PASSWORD,
  }
}
