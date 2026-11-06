import { and, asc, count, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import {
  FAILED_EMAIL_DAYS,
  type DashboardDto,
  type DashboardSession,
  type DashboardTodo,
} from '#shared/types/dashboard'
import { enumLabel, type SessionStatus } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDay, plural } from '#shared/utils/format'
import { slotSummary } from '#shared/utils/slots'

const ACTIVE: SessionStatus[] = ['draft', 'inviting', 'confirmed']

/** The number of a `select({ total: count() })`. */
async function total(query: PromiseLike<{ total: number }[]>): Promise<number> {
  const [row] = await query
  return row?.total ?? 0
}

/**
 * The Panoramica (docs/spec.md, 3.9): the next session, the numbers that lead to action, the
 * sessions to come with their progress and a "Da fare" list whose items link where they are done.
 */
export default defineEventHandler(async (event): Promise<DashboardDto> => {
  await requireAdmin(event)
  const db = useDb()
  const t = tables
  const today = todayIso()

  const sessions = await db
    .select({
      id: t.campSessions.id,
      title: t.campSessions.title,
      startDate: t.campSessions.startDate,
      endDate: t.campSessions.endDate,
      status: t.campSessions.status,
      responseDeadline: t.campSessions.responseDeadline,
      familySlots: t.campSessions.familySlots,
      staffNeeded: t.campSessions.staffNeeded,
      contractDocumentId: t.campSessions.contractDocumentId,
    })
    .from(t.campSessions)
    .where(inArray(t.campSessions.status, ACTIVE))
    .orderBy(asc(t.campSessions.startDate))
  const ids = sessions.map(s => s.id)
  const contracts = sessions.flatMap(s => (s.contractDocumentId ? [s.contractDocumentId] : []))

  const [participations, convocations, signedContracts, counts, expiredInvites, overdueSignatures] = await Promise.all([
    ids.length
      ? db
          .select({
            id: t.sessionFamilies.id,
            sessionId: t.sessionFamilies.sessionId,
            kind: t.sessionFamilies.kind,
            status: t.sessionFamilies.status,
            reserveRank: t.sessionFamilies.reserveRank,
          })
          .from(t.sessionFamilies)
          .where(inArray(t.sessionFamilies.sessionId, ids))
      : [],
    ids.length
      ? db
          .select({ sessionId: t.sessionStaff.sessionId, userId: t.sessionStaff.userId, status: t.sessionStaff.status })
          .from(t.sessionStaff)
          .where(inArray(t.sessionStaff.sessionId, ids))
      : [],
    contracts.length
      ? db
          .select({ documentId: t.signatureRequests.documentId, userId: t.signatureRequests.userId })
          .from(t.signatureRequests)
          .where(and(inArray(t.signatureRequests.documentId, contracts), eq(t.signatureRequests.status, 'signed')))
      : [],
    Promise.all([
      total(db.select({ total: count() }).from(t.staffProfiles).where(eq(t.staffProfiles.status, 'applied'))),
      total(db.select({ total: count() }).from(t.families).where(eq(t.families.formStatus, 'draft'))),
      total(
        db
          .select({ total: count() })
          .from(t.signatureRequests)
          .innerJoin(t.documents, eq(t.documents.id, t.signatureRequests.documentId))
          .where(and(eq(t.signatureRequests.status, 'pending'), isNull(t.documents.archivedAt))),
      ),
      total(
        db
          .select({ total: count() })
          .from(t.emailLog)
          .where(
            and(
              eq(t.emailLog.status, 'failed'),
              gte(t.emailLog.createdAt, sql`now() - make_interval(days => ${FAILED_EMAIL_DAYS})`),
            ),
          ),
      ),
    ]).then(([applicationsToReview, formsToComplete, signaturesPending, emailsFailed]) => ({
      applicationsToReview,
      formsToComplete,
      signaturesPending,
      emailsFailed,
    })),
    total(
      db
        .select({ total: count() })
        .from(t.users)
        .where(
          and(
            eq(t.users.status, 'invited'),
            sql`not exists (
              select 1 from ${t.authTokens}
              where ${t.authTokens.userId} = ${t.users.id} and ${t.authTokens.purpose} = 'invite'
                and ${t.authTokens.usedAt} is null and ${t.authTokens.expiresAt} > now()
            )`,
          ),
        ),
    ),
    total(
      db
        .select({ total: count() })
        .from(t.signatureRequests)
        .innerJoin(t.documents, eq(t.documents.id, t.signatureRequests.documentId))
        .where(
          and(
            eq(t.signatureRequests.status, 'pending'),
            isNull(t.documents.archivedAt),
            lt(t.signatureRequests.dueDate, today),
          ),
        ),
    ),
  ])

  const signed = new Set(signedContracts.map(s => `${s.documentId}:${s.userId}`))
  const progress = sessions.map((s): DashboardSession & { endsBeforeToday: boolean } => {
    const own = participations.filter(p => p.sessionId === s.id)
    const staff = convocations.filter(c => c.sessionId === s.id)
    const slots = slotSummary(s.familySlots, own)
    const accepted = staff.filter(c => c.status === 'accepted')
    return {
      id: s.id,
      title: s.title,
      startDate: s.startDate,
      endDate: s.endDate,
      status: s.status,
      responseDeadline: s.responseDeadline,
      places: {
        total: slots.total,
        held: slots.held,
        confirmed: slots.confirmed,
        awaiting: own.filter(p => p.kind === 'slot' && p.status === 'invited').length,
        free: slots.free,
        reserves: slots.reserves,
      },
      staff: {
        needed: s.staffNeeded,
        confirmed: accepted.filter(c => !s.contractDocumentId || signed.has(`${s.contractDocumentId}:${c.userId}`))
          .length,
        accepted: accepted.length,
        awaiting: staff.filter(c => c.status === 'sent').length,
        toSend: staff.filter(c => c.status === 'draft').length,
      },
      endsBeforeToday: s.endDate < today,
    }
  })
  const upcoming = progress.filter(s => !s.endsBeforeToday).map(({ endsBeforeToday: _, ...s }) => s)

  const todo: DashboardTodo[] = []
  const sessionTab = (id: string, tab?: string) => `/admin/sessioni/${id}${tab ? `?tab=${tab}` : ''}`
  for (const s of progress) {
    if (s.endsBeforeToday) {
      todo.push({
        key: `${s.id}:ended`,
        label:
          s.status === 'confirmed'
            ? `«${s.title}» è finita: segnala come conclusa`
            : `«${s.title}» è finita ma è ancora «${enumLabel('sessionStatus', s.status)}»: aggiorna lo stato`,
        detail: `Ultimo giorno ${formatDay(s.endDate)}`,
        to: sessionTab(s.id),
        icon: 'i-lucide-flag',
      })
      continue
    }
    const open = s.status === 'inviting' || s.status === 'confirmed'
    if (open && s.places.free > 0 && s.places.reserves > 0) {
      todo.push({
        key: `${s.id}:reserve`,
        label: `«${s.title}»: ${plural(s.places.free, 'posto libero', 'posti liberi')}, chiama la riserva`,
        detail: `${plural(s.places.reserves, 'riserva in attesa', 'riserve in attesa')}`,
        to: sessionTab(s.id, 'famiglie'),
        icon: 'i-lucide-list-ordered',
      })
    }
    if (s.status === 'inviting' && s.responseDeadline && s.responseDeadline < today && s.places.awaiting > 0) {
      todo.push({
        key: `${s.id}:answers`,
        label: `«${s.title}»: ${plural(s.places.awaiting, 'famiglia non ha', 'famiglie non hanno')} risposto`,
        detail: `Scadenza passata il ${formatDay(s.responseDeadline)}`,
        to: sessionTab(s.id, 'famiglie'),
        icon: 'i-lucide-phone',
      })
    }
    if (s.staff.toSend > 0) {
      todo.push({
        key: `${s.id}:convocations`,
        label: `«${s.title}»: ${plural(s.staff.toSend, 'convocazione da inviare', 'convocazioni da inviare')}`,
        to: sessionTab(s.id, 'staff'),
        icon: 'i-lucide-send',
      })
    }
    const missing = s.staff.needed - s.staff.accepted - s.staff.awaiting - s.staff.toSend
    if (open && missing > 0) {
      todo.push({
        key: `${s.id}:staff`,
        label: `«${s.title}»: ${plural(missing, 'persona dello staff da convocare', 'persone dello staff da convocare')}`,
        detail: `${s.staff.accepted} su ${s.staff.needed} hanno accettato`,
        to: sessionTab(s.id, 'staff'),
        icon: 'i-lucide-user-plus',
      })
    }
  }
  if (counts.applicationsToReview > 0) {
    todo.push({
      key: 'applications',
      label: `${plural(counts.applicationsToReview, 'candidatura da valutare', 'candidature da valutare')}`,
      to: '/admin/staff?tab=review',
      icon: 'i-lucide-inbox',
    })
  }
  if (overdueSignatures > 0) {
    todo.push({
      key: 'signatures',
      label: `${plural(overdueSignatures, 'firma oltre la scadenza', 'firme oltre la scadenza')}: manda un promemoria`,
      to: '/admin/documenti',
      icon: 'i-lucide-pen-line',
    })
  }
  if (counts.emailsFailed > 0) {
    todo.push({
      key: 'emails',
      label: `${plural(counts.emailsFailed, 'email non recapitata', 'email non recapitate')}: controlla gli indirizzi`,
      detail: `Negli ultimi ${FAILED_EMAIL_DAYS} giorni`,
      to: `/admin/comunicazioni?tab=registro&status=failed&days=${FAILED_EMAIL_DAYS}`,
      icon: 'i-lucide-mail-warning',
    })
  }
  if (expiredInvites > 0) {
    todo.push({
      key: 'invites',
      label: `${plural(expiredInvites, 'invito scaduto', 'inviti scaduti')}: ${expiredInvites === 1 ? 'invialo' : 'inviali'} di nuovo`,
      to: '/admin/utenti?status=invited',
      icon: 'i-lucide-mail',
    })
  }

  return {
    today,
    nextSession: upcoming[0] ?? null,
    upcoming,
    counts,
    todo,
  }
})
