// The canteen summary of a session (docs/spec.md 3.14): everyone who eats at the camp, the members of the
// families holding a place, the staff and the v-team still in play, with their allergies, diet and notes.
// Health data: the administration only, audited by the handlers. Explicit imports only, so the database
// tests can load it.
import { eq, sql } from 'drizzle-orm'
import type { CanteenDto } from '../../shared/types/canteen'
import { canteenNotCounted, canteenSummary, canteenWho, type CanteenPerson } from '../../shared/utils/canteen'
import { ENUM_META } from '../../shared/utils/constants'
import { NO_CARDS, fullName } from '../../shared/utils/format'
import { familyMembers, families, sessionFamilies, sessionStaff, staffProfiles, users } from '../db/schema'
import { sessionCsv } from './csv'
import type { DbOrTx } from './db'
import { sessionPdf, type PdfBlock } from './pdf'
import { activeStaff, findSession, holdingPlace } from './sessions'

/** GET /api/admin/sessions/:id/canteen */
export async function canteenOf(db: DbOrTx, sessionId: string): Promise<CanteenDto> {
  const [session, members, staff] = await Promise.all([
    findSession(db, sessionId),
    db
      .select({
        familyId: families.id,
        familyName: families.name,
        cardId: familyMembers.id,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
        info: familyMembers.usefulInfo,
        // Only this detail of the disability, not the others.
        foodSelectivity: sql<string | null>`${familyMembers.disability} ->> 'foodSelectivity'`,
      })
      .from(sessionFamilies)
      .innerJoin(families, eq(families.id, sessionFamilies.familyId))
      .leftJoin(familyMembers, eq(familyMembers.familyId, families.id))
      .where(holdingPlace(sessionId)),
    db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        info: staffProfiles.usefulInfo,
        team: staffProfiles.team,
      })
      .from(sessionStaff)
      .innerJoin(users, eq(users.id, sessionStaff.userId))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(activeStaff(sessionId)),
  ])
  const people: CanteenPerson[] = [
    ...members.flatMap(row =>
      row.cardId
        ? [
            {
              // A card still to fill in eats too: it shows as its family.
              name: row.firstName ? fullName(row) : `${row.familyName}, scheda da compilare`,
              info: row.info,
              foodSelectivity: row.foodSelectivity,
            },
          ]
        : [],
    ),
    ...staff.map(row => ({ name: fullName(row), info: row.info, foodSelectivity: null })),
  ]
  const volunteers = staff.filter(row => row.team === 'volunteer').length
  return {
    session: { title: session.title, startDate: session.startDate, endDate: session.endDate },
    ...canteenSummary(people),
    families: new Set(members.filter(row => row.cardId).map(row => row.familyId)).size,
    familyPeople: people.length - staff.length,
    staff: staff.length - volunteers,
    volunteers,
    withoutCards: members.filter(row => !row.cardId).map(row => row.familyName),
  }
}

/** The canteen summary as CSV: the total, each need with its people, then what to know. */
export async function canteenCsv(db: DbOrTx, sessionId: string): Promise<{ filename: string; csv: string }> {
  const summary = await canteenOf(db, sessionId)
  return sessionCsv(summary.session, 'mensa', [
    ['Voce', 'Persone', 'Chi'],
    ['Totale pasti (persone a ogni pasto)', summary.total, null],
    ['Persone delle famiglie', summary.familyPeople, null],
    [ENUM_META.staffTeam.staff.label, summary.staff, null],
    [ENUM_META.staffTeam.volunteer.label, summary.volunteers, null],
    ...summary.needs.map(need => [need.label, need.people.length, need.people.join(', ')]),
    ...summary.notes.map(note => ['Da sapere', null, `${note.name}: ${note.text}`]),
    ...summary.withoutCards.map(name => [NO_CARDS, null, name]),
  ])
}

/** The PDF for the supplier: the total, who eats, then each need with how many and who, then what to know. */
export function canteenPdfBlocks(summary: CanteenDto): PdfBlock[] {
  const notCounted = canteenNotCounted(summary)
  return [
    { heading: `Totale pasti: ${summary.total}` },
    `Persone a ogni pasto: ${canteenWho(summary)}.`,
    ...(notCounted ? [notCounted] : []),
    { heading: 'Esigenze alimentari' },
    ...(summary.needs.length
      ? summary.needs.flatMap(need => [{ label: `${need.people.length} ${need.label}` }, need.people.join(', ')])
      : ['Nessuna esigenza alimentare indicata.']),
    ...(summary.notes.length
      ? [{ heading: 'Da sapere' }, ...summary.notes.map(note => `${note.name}: ${note.text}`)]
      : []),
  ]
}

export async function canteenPdf(db: DbOrTx, sessionId: string): Promise<{ filename: string; data: Uint8Array }> {
  const summary = await canteenOf(db, sessionId)
  return sessionPdf(summary.session, {
    prefix: 'mensa',
    title: 'Pasti per il fornitore',
    blocks: canteenPdfBlocks(summary),
    notice: 'Dati riservati: servono solo a preparare i pasti.',
  })
}
