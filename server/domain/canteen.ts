// The canteen summary of a session (docs/spec.md 3.14): everyone who eats at the camp, the members of the
// families holding a place and the staff still in play, with their allergies, diet and notes. Health data:
// the administration only, audited by the handlers. Explicit imports only, so the database tests can load it.
import { eq } from 'drizzle-orm'
import type { CanteenDto } from '../../shared/types/canteen'
import { canteenSummary, type CanteenPerson } from '../../shared/utils/canteen'
import { NO_CARDS, fullName, isEmptyCard } from '../../shared/utils/format'
import { familyMembers, families, sessionFamilies, sessionStaff, staffProfiles, users } from '../db/schema'
import { sessionCsv } from './csv'
import type { DbOrTx } from './db'
import { activeStaff, findSession, holdingPlace } from './sessions'

/** GET /api/admin/sessions/:id/canteen */
export async function canteenOf(db: DbOrTx, sessionId: string): Promise<CanteenDto> {
  const session = await findSession(db, sessionId)
  const [members, staff] = await Promise.all([
    db
      .select({
        familyId: families.id,
        familyName: families.name,
        cardId: familyMembers.id,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
        info: familyMembers.usefulInfo,
        disability: familyMembers.disability,
      })
      .from(sessionFamilies)
      .innerJoin(families, eq(families.id, sessionFamilies.familyId))
      .leftJoin(familyMembers, eq(familyMembers.familyId, families.id))
      .where(holdingPlace(session.id)),
    db
      .select({ firstName: users.firstName, lastName: users.lastName, info: staffProfiles.usefulInfo })
      .from(sessionStaff)
      .innerJoin(users, eq(users.id, sessionStaff.userId))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(activeStaff(session.id)),
  ])
  const people: CanteenPerson[] = [
    ...members.flatMap(row =>
      row.cardId
        ? [
            {
              // A card still to fill in eats too: it shows as its family.
              name: isEmptyCard(row) ? `${row.familyName}, scheda da compilare` : fullName(row),
              info: row.info,
              foodSelectivity: row.disability?.foodSelectivity ?? null,
            },
          ]
        : [],
    ),
    ...staff.map(row => ({ name: fullName(row), info: row.info, foodSelectivity: null })),
  ]
  return {
    session: { title: session.title, startDate: session.startDate, endDate: session.endDate },
    ...canteenSummary(people),
    families: new Set(members.map(row => row.familyId)).size,
    staff: staff.length,
    withoutCards: members.filter(row => !row.cardId).map(row => row.familyName),
  }
}

/** The canteen summary as CSV: the total, each need with its people, then what to know. */
export async function canteenCsv(db: DbOrTx, sessionId: string): Promise<{ filename: string; csv: string }> {
  const summary = await canteenOf(db, sessionId)
  return sessionCsv(summary.session, 'mensa', [
    ['Voce', 'Persone', 'Chi'],
    ['Totale pasti (persone a ogni pasto)', summary.total, null],
    ...summary.needs.map(need => [need.label, need.people.length, need.people.join(', ')]),
    ...summary.notes.map(note => ['Da sapere', null, `${note.name}: ${note.text}`]),
    ...summary.withoutCards.map(name => [NO_CARDS, null, name]),
  ])
}
