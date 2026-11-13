// Italian formatting shared by the interface (useFormat) and the email templates, so a date reads
// the same on screen and in the inbox. Days are formatted as calendar days (no time zone shift);
// instants are shown in Italian time.
import { enumLabel, LOCALE, TIME_ZONE, type MemberKind, type MemberRelationship } from './constants'
import { ageOn, daysBetween, todayIso, type IsoDay } from './dates'

type DayStyle = 'long' | 'short' | 'numeric'

const DAY_OPTIONS: Record<DayStyle, Intl.DateTimeFormatOptions> = {
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>()
function dayFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options)
  let formatter = dayFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' })
    dayFormatters.set(key, formatter)
  }
  return formatter
}

function dayToDate(day: IsoDay): Date {
  return new Date(`${day}T00:00:00Z`)
}

/** "12 lug 2027" (short), "12 luglio 2027" (long), "12/07/2027" (numeric). Empty for no day. */
export function formatDay(day: IsoDay | null | undefined, style: DayStyle = 'short'): string {
  if (!day) return ''
  return dayFormatter(DAY_OPTIONS[style]).format(dayToDate(day))
}

/** "12–18 lug 2027", "30 giu – 5 lug 2027": the shared parts are written once. */
export function formatDayRange(start: IsoDay, end: IsoDay, style: Exclude<DayStyle, 'numeric'> = 'short'): string {
  if (start === end) return formatDay(start, style)
  // ICU's Italian range patterns pad the day ("06–12 set"): the parts let us write it as formatDay does.
  return dayFormatter(DAY_OPTIONS[style])
    .formatRangeToParts(dayToDate(start), dayToDate(end))
    .map(part => (part.type === 'day' ? String(Number(part.value)) : part.value))
    .join('')
}

/** "sabato 12 luglio". */
export function formatWeekday(day: IsoDay): string {
  return dayFormatter({ weekday: 'long', day: 'numeric', month: 'long' }).format(dayToDate(day))
}

/** "luglio 2027". */
export function formatMonth(day: IsoDay): string {
  return dayFormatter({ month: 'long', year: 'numeric' }).format(dayToDate(day))
}

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** An instant in Italian time: "12 lug 2027, 14:05". */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormatter.format(date)
}

/** "oggi", "domani", "ieri", "tra 5 giorni", "3 giorni fa". */
export function relativeDay(day: IsoDay, today: IsoDay = todayIso()): string {
  const diff = daysBetween(today, day)
  if (diff === 0) return 'oggi'
  if (diff === 1) return 'domani'
  if (diff === -1) return 'ieri'
  return diff > 0 ? `tra ${diff} giorni` : `${-diff} giorni fa`
}

/** "Mario Rossi". */
export function fullName(person: { firstName: string | null; lastName: string | null } | null | undefined): string {
  if (!person) return ''
  return `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim()
}

type MemberRef = { id: string; firstName: string | null; lastName: string | null; kind: MemberKind }

/** Shown instead of the people of a family that has no cards yet (it has not confirmed its data). */
export const NO_CARDS = 'Componenti non ancora indicati'

/** The family as the lists show it, «Famiglia Rossi», from the surname the forms ask for. */
export function familyNameOf(surname: string): string {
  const value = surname.trim()
  return /^famiglia\s/i.test(value) ? value : `Famiglia ${value}`
}

/** The surname a form shows for the family: its name without «Famiglia». */
export function surnameOf(name: string): string {
  return name.replace(/^famiglia\s+/i, '')
}

/**
 * A card created from the family data and not filled in yet: name, surname and relationship are null
 * together until the family saves it (the young person with a condition keeps no relationship).
 */
export function isEmptyCard(member: { firstName: string | null }): boolean {
  return member.firstName === null
}

/** An adult without the birth date the card requires (the member schema); a young person's is optional. */
export function missingBirthDate(member: { kind: MemberKind; birthDate?: string | null }): boolean {
  return member.kind === 'adult' && !member.birthDate
}

/** A card the family still has to fill in: empty, or an adult without the birth date. */
export function isCardToComplete(member: { firstName: string | null; kind: MemberKind; birthDate: string | null }) {
  return isEmptyCard(member) || missingBirthDate(member)
}

/**
 * A member's name or, while the family has not filled in the card, what the card is: "Adulto 2",
 * numbered among the cards of its kind in `members` (the whole family, in its order).
 */
export function memberName(member: MemberRef, members: Pick<MemberRef, 'id' | 'kind'>[]): string {
  if (!isEmptyCard(member)) return fullName(member)
  const sameKind = members.filter(other => other.kind === member.kind)
  return `${enumLabel('memberKind', member.kind)} ${sameKind.findIndex(other => other.id === member.id) + 1}`
}

/** Initials for avatars: "MR". */
export function initials(person: { firstName: string; lastName: string } | null | undefined): string {
  if (!person) return ''
  return `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase()
}

/** "1 famiglia", "3 famiglie". */
/** "a, b o c". */
export function orList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} o ${items.at(-1)}`
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "1 anno", "9 anni". */
export function formatAge(age: number): string {
  return age === 1 ? '1 anno' : `${age} anni`
}

/**
 * A filled card in one line: relationship and age, «Genitore · 41 anni», or what is missing. The young
 * person with a condition has no relationship: only the age. `withDay` adds the birth date.
 */
export function memberLine(
  member: { relationship: MemberRelationship | null; kind: MemberKind; birthDate: IsoDay | null },
  withDay = false,
): string {
  const parts = member.relationship ? [enumLabel('memberRelationship', member.relationship)] : []
  if (member.birthDate) {
    const age = formatAge(ageOn(member.birthDate))
    parts.push(withDay ? `${age} (${formatDay(member.birthDate)})` : age)
  } else if (missingBirthDate(member)) parts.push('manca la data di nascita')
  return parts.join(' · ')
}

/** "9 e 14 anni", "1 anno", "12 anni, un’età da indicare": ages, youngest first; '' for none. */
export function formatAges(ages: (number | null)[]): string {
  const known = ages.filter((age): age is number => age !== null).sort((a, b) => a - b)
  const unknown = ages.length - known.length
  const parts: string[] = []
  if (known.length) {
    const last = known.at(-1)!
    parts.push(known.length === 1 ? formatAge(last) : `${known.slice(0, -1).join(', ')} e ${last} anni`)
  }
  if (unknown) parts.push(unknown === 1 ? 'un’età da indicare' : `${unknown} età da indicare`)
  return parts.join(', ')
}

const numberFormatter = new Intl.NumberFormat(LOCALE)

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

/** "1,2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`
}
