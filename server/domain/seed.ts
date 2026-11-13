// Demo data for development (POST /api/dev/seed, scripts/dev-seed.mjs) and for a test installation
// (NUXT_DEMO_SEED, server/plugins/start.ts). Every person, family and
// document is invented; health details are placeholders marked "(esempio)". Dates are fixed around the
// 2026 summer and the 2027 calendar (shared/content/calendar-2027.ts).
import { and, eq, sql } from 'drizzle-orm'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { DisabilityInfo, FormAnswers, UsefulInfo } from '../../shared/types/domain'
import type { FeedbackArchive } from '../../shared/types/feedback'
import type {
  ConvocationStatus,
  MemberRelationship,
  ParticipationKind,
  ParticipationStatus,
  ProgrammeGroup,
  StaffRole,
  ItalianRegion,
  StaffStatus,
  StaffTeam,
} from '../../shared/utils/constants'
import { CALENDAR_2027, calendarTitle } from '../../shared/content/calendar-2027'
import { FEEDBACK_OTHER_ITEMS } from '../../shared/content/feedback-form'
import { programmeTemplate } from '../../shared/content/programme-template'
import { DEFAULT_FAMILY_SLOTS, DEFAULT_LOCATION, DEFAULT_STAFF_NEEDED } from '../../shared/utils/constants'
import { familyNameOf } from '../../shared/utils/format'
import * as t from '../db/schema'
import type { Db, DbOrTx } from './db'
import { storeFile } from './storage'

export const DEMO_PASSWORD = 'invictus-demo'

export const DEMO_ACCOUNTS = {
  admin: 'admin@invictuscamp.local',
  family: 'famiglia@invictuscamp.local',
  staff: 'staff@invictuscamp.local',
  candidate: 'candidato@invictuscamp.local',
  /** Just registered: no members yet, the family data and the questionnaire still to fill in. */
  newFamily: 'nuova@invictuscamp.local',
} as const

const TABLES = [
  'audit_log',
  'email_log',
  'feedback_archives',
  'feedback_responses',
  'communications',
  'personal_documents',
  'signature_requests',
  'session_staff',
  'session_families',
  'lodgings',
  'documents',
  'programmes',
  'session_availability',
  'camp_sessions',
  'staff_profiles',
  'family_members',
  'families',
  'files',
  'auth_tokens',
  'users',
]

/**
 * Empties every table but `message_templates`: its examples come from migration 0006, and an administration
 * keeps its templates across a reset of the demo data. No cascade: a table left out that references one of
 * these makes the reset fail instead of being emptied with them. Development and tests only.
 */
export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql.raw(`truncate table ${TABLES.join(', ')} restart identity`))
}

interface DemoMember {
  firstName: string
  /** None for the young person with a condition (`disability`): the others' relationship is to them. */
  relationship?: MemberRelationship
  birthDate?: string
  /** The young person's condition: a key of the «Tipologia» choices. */
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
        birthDate: '2015-04-12',
        disability: 'autism',
      },
      { firstName: 'Sofia', relationship: 'sibling', birthDate: '2018-09-30' },
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
        birthDate: '2014-02-03',
        disability: 'motor',
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
        birthDate: '2016-06-21',
        disability: 'genetic',
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
        birthDate: '2013-11-08',
        disability: 'motor',
      },
      { firstName: 'Giorgia', relationship: 'sibling', birthDate: '2011-01-17' },
    ],
  },
  {
    first: 'Rosa',
    last: 'Lombardi',
    city: 'Manduria',
    province: 'TA',
    submitted: true,
    members: [{ firstName: 'Davide', birthDate: '2017-03-14', disability: 'epilepsy' }],
  },
  {
    first: 'Salvatore',
    last: 'Marino',
    city: 'Matera',
    province: 'MT',
    submitted: true,
    members: [
      { firstName: 'Carla', relationship: 'parent' },
      { firstName: 'Emma', birthDate: '2015-08-02', disability: 'chronic' },
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
        birthDate: '2012-05-27',
        disability: 'intellectual',
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
        birthDate: '2016-12-09',
        disability: 'genetic',
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
        birthDate: '2014-07-19',
        disability: 'motor',
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
        birthDate: '2013-04-30',
        disability: 'chronic',
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
        birthDate: '2018-02-11',
        disability: 'genetic',
      },
    ],
  },
  {
    first: 'Giuseppe',
    last: 'Santoro',
    email: DEMO_ACCOUNTS.newFamily,
    city: 'Martina Franca',
    province: 'TA',
    submitted: false,
    members: [],
  },
]

/** Who led the activities of the completed session, as the programme names them. */
const DEMO_ACTIVITY_LEADS: Record<string, string> = {
  'Piscina / Spa': 'Chiara',
  'Parco avventura / Radio': 'Lorenzo',
  Spiaggia: 'Martina',
  'Teatro / Circo': 'Chiara e Lorenzo',
  'Musica / Scultura': 'Martina',
}

/** Four families' answers to the questionnaire of the completed session, invented. 0: not done. */
function demoAnswers(activities: string[]): { votes: Record<string, number>; answers: Record<string, string> }[] {
  const activityVotes = [
    [5, 5, 4, 5, 3, 5],
    [5, 4, 5, 4, 5, 4],
    [4, 5, 5, 3, 4, 5],
    [5, 5, 4, 5, 5, 0],
  ]
  const otherVotes = [
    [4, 5, 5, 5, 5],
    [3, 5, 4, 5, 5],
    [5, 5, 5, 4, 4],
    [4, 4, 0, 5, 5],
  ]
  const answers: Record<string, string>[] = [
    {
      suggestions: 'Più tempo libero in spiaggia nel pomeriggio.',
      meaning: 'Una settimana in cui nostro figlio è stato semplicemente un ragazzo come gli altri.',
    },
    {
      information: 'Avremmo voluto sapere prima gli orari della piscina.',
      message: 'Grazie a tutti i volontari, siete stati fantastici.',
    },
    { extraActivities: 'Un laboratorio di cucina per i ragazzi.', final: 'Torneremo sicuramente.' },
    { suggestions: 'Una serata in più tutti insieme.', meaning: 'Una famiglia più grande.' },
  ]
  const votesOf = (labels: readonly string[], values: number[]) =>
    labels.flatMap((label, index) => (values[index] ? [[label, values[index]] as const] : []))
  return answers.map((written, index) => ({
    votes: Object.fromEntries([
      ...votesOf(activities, activityVotes[index]!),
      ...votesOf(FEEDBACK_OTHER_ITEMS, otherVotes[index]!),
    ]),
    answers: written,
  }))
}

/** A small invented imported year (docs/spec.md 3.13): three sessions, a few questions, comments, staff. */
function demoFeedback(): FeedbackArchive {
  const sessions = [
    { number: 1, respondents: 6 },
    { number: 2, respondents: 5 },
    { number: 3, respondents: 7 },
  ]
  const items: FeedbackArchive['items'] = [
    { label: 'Piscina', kind: 'activity' },
    { label: 'Spiaggia', kind: 'activity' },
    { label: 'Arte', kind: 'activity' },
    { label: 'Parco avventura', kind: 'activity' },
    { label: 'Accoglienza del primo giorno', kind: 'other' },
    { label: 'Staff', kind: 'other' },
  ]
  const pattern = [5, 5, 4, 5, 3, 5, 4]
  const votes = sessions.flatMap(({ number, respondents }) =>
    Array.from({ length: respondents }, (_, family) =>
      items.map((_, item): [number, number, number] => [
        number,
        item,
        pattern[(number * 7 + family * 3 + item * 5) % 7]!,
      ]),
    ).flat(),
  )
  const turn = (session: number, activity: string, names: string[], [five, four, low]: number[]) => ({
    session,
    activity,
    names,
    votes: { five: five!, four: four!, low: low! },
    note: null,
  })
  return {
    sessions,
    items,
    votes,
    themes: [
      {
        title: 'Più tempo in piscina',
        families: 4,
        sessions: [1, 3],
        detail: 'Più turni in piscina durante la settimana, anche per i più grandi (esempio).',
      },
      {
        title: 'Il programma prima di arrivare',
        families: 3,
        sessions: [2],
        detail: 'Ricevere il programma della settimana qualche giorno prima (esempio).',
      },
    ],
    comments: {
      questions: ['Suggerimenti e feedback', 'Che cos’è Invictus Camp per te', 'Messaggio a staff e volontari'],
      items: [
        { session: 1, family: 1, question: 0, text: 'Più tempo in piscina per i ragazzi più grandi (esempio).' },
        {
          session: 1,
          family: 2,
          question: 1,
          text: 'Una settimana in cui sentirci una famiglia come le altre (esempio).',
        },
        {
          session: 2,
          family: 1,
          question: 0,
          text: 'Ci sarebbe piaciuto avere il programma qualche giorno prima (esempio).',
        },
        { session: 2, family: 3, question: 2, text: 'Grazie a tutti i volontari, siete stati fantastici (esempio).' },
        {
          session: 3,
          family: 2,
          question: 1,
          text: 'Un posto dove nostro figlio ha fatto cose che non pensavamo possibili (esempio).',
        },
        { session: 3, family: 5, question: 2, text: 'Grazie per la pazienza e i sorrisi di ogni giorno (esempio).' },
      ],
    },
    staff: {
      note: null,
      people: [
        { name: 'Chiara Bianchi', sessions: [1, 2, 3] },
        { name: 'Lorenzo Fontana', sessions: [1, 3] },
        { name: 'Sara Galli', sessions: [1] },
        { name: 'Martina Greco', sessions: [2] },
      ],
      turns: [
        turn(1, 'Piscina', ['Chiara Bianchi'], [5, 1, 0]),
        turn(2, 'Piscina', ['Chiara Bianchi'], [3, 1, 1]),
        turn(3, 'Piscina', ['Chiara Bianchi'], [6, 1, 0]),
        turn(1, 'Arte', ['Lorenzo Fontana', 'Sara Galli'], [4, 1, 1]),
        turn(3, 'Parco avventura', ['Lorenzo Fontana'], [5, 2, 0]),
      ],
    },
  }
}

type DemoSession = 'june' | 'july' | 'september'
/** The sessions of the 2027 calendar (by number) that carry the demo: same first days as before the calendar. */
const DEMO_CALENDAR: Record<DemoSession, number> = { june: 9, july: 11, september: 18 }

const STAFF: {
  first: string
  last: string
  email?: string
  status: StaffStatus
  team?: StaffTeam
  roles: StaffRole[]
  city: string
  /** The 2027 sessions the person said they can come to. */
  sessions: DemoSession[]
}[] = [
  {
    first: 'Chiara',
    last: 'Bianchi',
    email: DEMO_ACCOUNTS.staff,
    status: 'approved',
    roles: ['group_lead'],
    city: 'Lecce',
    sessions: ['june', 'july'],
  },
  {
    first: 'Paolo',
    last: 'Gallo',
    email: DEMO_ACCOUNTS.candidate,
    status: 'applied',
    roles: ['activity_lead'],
    city: 'Taranto',
    sessions: [],
  },
  {
    first: 'Martina',
    last: 'Conti',
    status: 'approved',
    roles: ['group_lead'],
    city: 'Bari',
    sessions: ['june'],
  },
  {
    first: 'Andrea',
    last: 'Fontana',
    status: 'approved',
    roles: ['activity_lead'],
    city: 'Brindisi',
    sessions: ['june', 'july'],
  },
  {
    first: 'Serena',
    last: 'Barbieri',
    status: 'approved',
    roles: ['activity_lead'],
    city: 'Lecce',
    sessions: ['september'],
  },
  {
    first: 'Lorenzo',
    last: 'Moretti',
    status: 'approved',
    roles: ['coordinator', 'activity_lead'],
    city: 'Taranto',
    sessions: ['june', 'july', 'september'],
  },
  {
    first: 'Federica',
    last: 'Rinaldi',
    status: 'approved',
    roles: ['group_lead'],
    city: 'Grottaglie',
    sessions: ['june'],
  },
  {
    first: 'Simone',
    last: 'Caruso',
    status: 'approved',
    roles: ['group_lead'],
    city: 'Ostuni',
    sessions: ['june', 'july'],
  },
  {
    first: 'Giulia',
    last: 'Marino',
    status: 'approved',
    team: 'volunteer',
    roles: ['coordinator'],
    city: 'Maruggio',
    sessions: ['june', 'july', 'september'],
  },
  {
    first: 'Matteo',
    last: 'Greco',
    status: 'approved',
    team: 'volunteer',
    roles: ['other'],
    city: 'Manduria',
    sessions: ['june'],
  },
  {
    first: 'Elisa',
    last: 'Romano',
    status: 'approved',
    team: 'volunteer',
    roles: ['other'],
    city: 'Taranto',
    sessions: ['july', 'september'],
  },
  {
    first: 'Davide',
    last: 'Leone',
    status: 'applied',
    team: 'volunteer',
    roles: ['other'],
    city: 'Sava',
    sessions: [],
  },
  { first: 'Ilaria', last: 'Ferri', status: 'applied', roles: ['activity_lead'], city: 'Bari', sessions: [] },
  { first: 'Gabriele', last: 'Testa', status: 'rejected', roles: ['other'], city: 'Lecce', sessions: [] },
  { first: 'Noemi', last: 'Pellegrini', status: 'registered', roles: [], city: 'Taranto', sessions: [] },
]

/** The «Informazioni utili» of the demo members, in turn: most have nothing to say. */
const DEMO_USEFUL_INFO: (UsefulInfo | null)[] = [
  null,
  { allergies: ['milk'] },
  null,
  { diet: 'vegetarian' },
  null,
  { allergies: ['gluten'] },
  null,
  null,
  { allergies: ['nuts'], notes: 'Porta con sé l’autoiniettore (esempio).' },
]

const DEMO_ANSWERS: FormAnswers = {
  howDidYouHear: 'Associazione o ente',
  association: 'Associazione Insieme (esempio)',
  sessionPreferences: ['Sessioni nel weekend (2 notti)', 'Sessioni settimanali estive (4 notti)'],
  accommodationNeeds: ['Bagno senza barriere architettoniche'],
  dog: false,
}

/** An example layout of the camp: villette with a kitchen, rooms in the residence. */
type NewLodging = typeof t.lodgings.$inferInsert
const DEMO_LODGINGS: NewLodging[] = [
  ...[1, 2, 3, 4, 5, 6].map((n): NewLodging => ({
    name: `Villetta ${n}`,
    area: 'Villette',
    beds: n <= 2 ? 4 : 5,
    features: n <= 2 ? ['kitchen', 'accessible_bathroom', 'microwave'] : ['kitchen', 'microwave'],
    description: n <= 2 ? '1 matrimoniale e 2 singoli, piano terra' : '1 matrimoniale, 1 a castello e 1 divano letto',
  })),
  ...[1, 2, 3, 4].map((n): NewLodging => ({
    name: `Camera ${n}`,
    area: 'Residence',
    beds: n === 1 ? 3 : 4,
    features: n === 1 ? ['accessible_bathroom', 'microwave'] : ['microwave'],
    description: n === 1 ? '1 matrimoniale e 1 singolo, piano terra' : '1 matrimoniale e 2 singoli, primo piano',
  })),
]

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

/**
 * The demo data, only on an installation without families (its admins share a public password): at start
 * with NUXT_DEMO_SEED (server/plugins/start.ts) and from POST /api/dev/seed. Null when families exist.
 * Run it in a transaction.
 */
export async function seedDemoIfMissing(
  db: DbOrTx,
  options: { passwordHash: () => Promise<string>; uploadsDir: string },
): Promise<SeedSummary | null> {
  if (await db.$count(t.families)) return null
  return seedDemo(db, { passwordHash: await options.passwordHash(), uploadsDir: options.uploadsDir })
}

/** Fills a database without families with a believable season (beside its own admins, if any). */
export async function seedDemo(
  db: DbOrTx,
  options: { passwordHash: string; uploadsDir: string },
): Promise<SeedSummary> {
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
    // Health data (disability, allergies) only with the consent, given by the families with a condition.
    const consent = f.members.some(m => m.disability)
    const [family] = await db
      .insert(t.families)
      .values({
        userId: user.id,
        name: familyNameOf(f.last),
        address: f.submitted ? 'Via Roma 1 (esempio)' : null,
        city: f.city,
        province: f.province,
        ...(f.submitted ? DEMO_PROVINCES[f.province] : {}),
        phone,
        formAnswers: f.submitted ? DEMO_ANSWERS : {},
        formStatus: f.submitted ? 'submitted' : 'draft',
        formSubmittedAt: f.submitted ? new Date('2026-10-02T10:00:00Z') : null,
        privacyConsentAt: verified,
        healthDataConsentAt: consent ? verified : null,
      })
      .returning({ id: t.families.id })
    const members: DemoMember[] = [{ firstName: f.first, relationship: 'parent' }, ...f.members]
    await db.insert(t.familyMembers).values(
      members.map((m, position) => {
        const kind = m.relationship === 'sibling' || m.disability ? ('young' as const) : ('adult' as const)
        return {
          familyId: family!.id,
          firstName: m.firstName,
          lastName: f.last,
          // The young person with a condition has no relationship: the others' is to them.
          relationship: m.relationship ?? null,
          kind,
          // An adult's birth date is required by the form: one per demo adult, between 1972 and 1986.
          birthDate:
            m.birthDate ??
            (kind === 'adult' ? `${1972 + ((index * 3 + position) % 15)}-0${(position % 9) + 1}-15` : null),
          isReferent: position === 0,
          hasDisability: Boolean(m.disability),
          disability: m.disability
            ? ({
                conditions: [m.disability],
                support: ['hygiene', 'emotions'],
                mobility: [m.disability === 'motor' ? 'manual_wheelchair' : 'autonomous'],
                communication: ['short_sentences'],
                care: [m.disability === 'epilepsy' ? 'seizures' : 'none'],
              } satisfies DisabilityInfo)
            : null,
          // Some allergies and diets for the canteen summary.
          usefulInfo: consent ? (DEMO_USEFUL_INFO[(index + position) % DEMO_USEFUL_INFO.length] ?? null) : null,
          position,
        }
      }),
    )
    families.push({ userId: user.id, familyId: family!.id, email: user.email, firstName: user.firstName })
  }

  // Staff
  const staff: { userId: string; email: string; firstName: string; status: StaffStatus; sessions: DemoSession[] }[] = []
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
      team: s.team ?? 'staff',
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
    staff.push({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      status: s.status,
      sessions: s.sessions,
    })
  }

  // Sessions
  const sessionValues = (values: Omit<typeof t.campSessions.$inferInsert, 'location' | 'createdBy'>) => ({
    location: DEFAULT_LOCATION,
    createdBy: admin.id,
    ...values,
  })
  const session = async (values: Parameters<typeof sessionValues>[0]) => {
    const [row] = await db.insert(t.campSessions).values(sessionValues(values)).returning()
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
  // The 2027 calendar: three sessions carry the demo (invitations, staff, lodgings), the others are drafts.
  const calendar = (number: number) => {
    const entry = CALENDAR_2027[number - 1]!
    return { title: calendarTitle(entry), startDate: entry.startDate, endDate: entry.endDate }
  }
  const june = await session({
    ...calendar(DEMO_CALENDAR.june),
    description: 'Settimana estiva del calendario 2027.',
    status: 'inviting',
    familySlots: 6,
    staffNeeded: 8,
    responseDeadline: '2027-05-15',
    statusChangedAt: new Date('2026-10-25T09:00:00Z'),
  })
  const july = await session({
    ...calendar(DEMO_CALENDAR.july),
    status: 'draft',
    familySlots: 8,
    staffNeeded: 10,
    responseDeadline: '2027-06-10',
  })
  // The 2027 programme, from the model week: every 2027 session uses it.
  await db.insert(t.programmes).values({ year: 2027, content: programmeTemplate() }).onConflictDoNothing()
  // An imported year of feedback, invented (the real 2026 comes from scripts/import-feedback.mjs): 2025, so
  // that 2026 shows the questionnaire of the completed session.
  await db
    .insert(t.feedbackArchives)
    .values({ year: 2025, data: demoFeedback(), source: 'Dati di esempio', importedBy: admin.id })
    .onConflictDoNothing()
  const september = await session({
    ...calendar(DEMO_CALENDAR.september),
    status: 'draft',
    familySlots: DEFAULT_FAMILY_SLOTS,
    staffNeeded: DEFAULT_STAFF_NEEDED,
  })
  const demoNumbers = new Set(Object.values(DEMO_CALENDAR))
  await db.insert(t.campSessions).values(
    CALENDAR_2027.filter(entry => !demoNumbers.has(entry.number)).map(entry =>
      sessionValues({
        ...calendar(entry.number),
        familySlots: DEFAULT_FAMILY_SLOTS,
        staffNeeded: DEFAULT_STAFF_NEEDED,
      }),
    ),
  )

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

  // Lodgings (spec 3.11): an example layout until the camp gives the real one, used by two sessions.
  const lodgingRows = await db.insert(t.lodgings).values(DEMO_LODGINGS).returning({ id: t.lodgings.id })
  /** Changes the participation of a demo family in a session. */
  const setParticipation = (
    sessionId: string,
    familyIndex: number,
    values: Partial<typeof t.sessionFamilies.$inferInsert>,
  ) =>
    db
      .update(t.sessionFamilies)
      .set(values)
      .where(
        and(
          eq(t.sessionFamilies.sessionId, sessionId),
          eq(t.sessionFamilies.familyId, families[familyIndex]!.familyId),
        ),
      )
  const lodge = async (sessionId: string, rows: [familyIndex: number, lodgingIndex: number][]) => {
    for (const [familyIndex, lodgingIndex] of rows) {
      await setParticipation(sessionId, familyIndex, { lodgingId: lodgingRows[lodgingIndex]!.id })
    }
  }
  await lodge(past.id, [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 6],
    [4, 7],
  ])
  await lodge(june.id, [
    [1, 0],
    [2, 3],
    [3, 7],
  ])

  // Activity groups (spec 3.12): the completed session split in full, June still to finish.
  const groups: [sessionId: string, familyIndex: number, group: ProgrammeGroup][] = [
    [past.id, 0, 'yellow'],
    [past.id, 1, 'red'],
    [past.id, 2, 'blue'],
    [past.id, 3, 'yellow'],
    [past.id, 4, 'red'],
    [june.id, 1, 'yellow'],
    [june.id, 2, 'red'],
    [june.id, 3, 'blue'],
  ]
  for (const [sessionId, familyIndex, group] of groups) {
    await setParticipation(sessionId, familyIndex, { activityGroup: group })
  }

  // Availability: one answer per session (spec 3.5).
  const demoSessions: Record<DemoSession, string> = { june: june.id, july: july.id, september: september.id }
  const answers = staff.flatMap(s => s.sessions.map(key => ({ sessionId: demoSessions[key], userId: s.userId })))
  if (answers.length) await db.insert(t.sessionAvailability).values(answers)

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
        message: status === 'draft' ? null : 'Ti aspettiamo al camp per la settimana di fine giugno.',
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
    ['Lorenzo', 'accepted', 'coordinator'],
    ['Federica', 'draft', 'group_lead'],
    ['Simone', 'sent', 'group_lead'],
    ['Giulia', 'accepted', 'coordinator'],
    ['Matteo', 'sent', 'other'],
  ])
  await convoke(july.id, [
    ['Andrea', 'draft', 'activity_lead'],
    ['Simone', 'draft', 'group_lead'],
  ])
  const lead = (sessionId: string, first: string, group: ProgrammeGroup) =>
    db
      .update(t.sessionStaff)
      .set({ activityGroup: group })
      .where(and(eq(t.sessionStaff.sessionId, sessionId), eq(t.sessionStaff.userId, byName(first).userId)))
  await lead(past.id, 'Chiara', 'yellow')
  await lead(past.id, 'Martina', 'red')
  await lead(past.id, 'Lorenzo', 'blue')
  await lead(june.id, 'Martina', 'yellow')
  await lead(june.id, 'Chiara', 'red')

  // The questionnaire of the completed session (spec 3.13): its programme as it was when it closed, with who
  // led each activity, and the answers of four families; famiglia@ has not answered yet.
  const pastWeek = programmeTemplate()
  for (const day of pastWeek.days) {
    for (const block of day.blocks) {
      for (const turn of Object.values(block.groups ?? {})) {
        if (turn.activity) turn.lead = DEMO_ACTIVITY_LEADS[turn.activity] ?? ''
      }
    }
  }
  await db.insert(t.programmes).values({ sessionId: past.id, content: pastWeek })
  await db.insert(t.feedbackResponses).values(
    demoAnswers(pastWeek.activities).map((answer, index) => ({
      sessionId: past.id,
      familyId: families[index + 1]!.familyId,
      ...answer,
      createdAt: new Date(`2026-07-2${index + 1}T18:00:00Z`),
    })),
  )

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
  const contract = await document(`Contratto di collaborazione · ${june.title}`, 'contract', june.id)
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
      subject: `Invito: ${june.title}`,
      status: 'simulated' as const,
      sessionId: june.id,
      createdAt: new Date('2026-10-25T09:00:00Z'),
    })),
    ...[6, 7, 8].map(i => ({
      template: 'session.reserve',
      toEmail: families[i]!.email,
      toUserId: families[i]!.userId,
      subject: `Lista di riserva: ${june.title}`,
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
    sessions: 2 + CALENDAR_2027.length,
    documents: 4,
    accounts: DEMO_ACCOUNTS,
    password: DEMO_PASSWORD,
  }
}
