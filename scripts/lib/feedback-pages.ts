// Reads the 2026 feedback pages the camp published (Nicola's feedback, commenti and staff pages) into a
// FeedbackArchive. Feedback and comments carry their data as JSON inside the page; the staff page is plain
// HTML (a presence table and one <details> per person with the activities they led).
//
// Type imports only: scripts/import-feedback.mjs loads this file with Node's type stripping.
import type { FeedbackArchive, FeedbackTurn } from '../../shared/types/feedback'

/** The named entities an Italian page may use; an unknown one is left as it is. */
// prettier-ignore
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', deg: '°', euro: '€',
  agrave: 'à', aacute: 'á', egrave: 'è', eacute: 'é', igrave: 'ì', iacute: 'í', ograve: 'ò', oacute: 'ó',
  ugrave: 'ù', uacute: 'ú', Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
}

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? whole
    const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
    return n <= 0x10ffff ? String.fromCodePoint(n) : whole
  })
}

const textOf = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

/** The JSON of `<script type="application/json" id="…">`. */
function pageJson<T>(html: string, id: string): T {
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (
      attributes!.includes('application/json') &&
      new RegExp(`(?:^|\\s)id=(["']?)${id}\\1(?:\\s|$)`).test(attributes!)
    )
      return JSON.parse(body!) as T
  }
  throw new Error(`no JSON block "${id}" in the page`)
}

interface FeedbackJson {
  /** Families that answered, by session number. */
  n: Record<string, number>
  /** [session, 0 activity | 1 other, item, vote] */
  r: [number, number, string, number][]
  temi: { tema: string; count: number; sessioni: number[]; dettaglio: string }[]
}

function parseFeedbackPage(html: string): Pick<FeedbackArchive, 'sessions' | 'items' | 'votes' | 'themes'> {
  const data = pageJson<FeedbackJson>(html, 'fd')
  const items: FeedbackArchive['items'] = []
  const index = new Map<string, number>()
  const votes = data.r.map(([session, group, label, vote]): FeedbackArchive['votes'][number] => {
    if (!index.has(label)) {
      index.set(label, items.length)
      items.push({ label, kind: group === 0 ? 'activity' : 'other' })
    }
    return [session, index.get(label)!, vote]
  })
  return {
    sessions: Object.entries(data.n)
      .map(([number, respondents]) => ({ number: Number(number), respondents }))
      .sort((a, b) => a.number - b.number),
    items,
    votes,
    themes: data.temi.map(t => ({ title: t.tema, families: t.count, sessions: t.sessioni, detail: t.dettaglio })),
  }
}

interface CommentsJson {
  cats: string[]
  items: { s: number; f: number; c: number; t: string }[]
}

function parseCommentsPage(html: string): FeedbackArchive['comments'] {
  const data = pageJson<CommentsJson>(html, 'data')
  return {
    questions: data.cats,
    // An empty answer is not a comment.
    items: data.items.map(i => ({ session: i.s, family: i.f, question: i.c, text: i.t.trim() })).filter(i => i.text),
  }
}

/** "voto solo per questa attività" is the plain case: no note, and not in front of one. */
const PLAIN_LEAD = /^voto solo per questa attività(?: · )?/
/** Says who the partner of a turn in pairs was: the names of the turn already say it. */
const PAIR_NOTE = /^condotta in coppia con .*$/

function parseStaffPage(html: string): FeedbackArchive['staff'] {
  const page = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
  const note = textOf(page).match(/Non sono contati[^.]*\./)?.[0] ?? null

  // Presences: the header names the session columns (S1…), a dot marks the sessions of the person.
  const table = page.match(/<table[\s\S]*?<\/table>/)?.[0]
  if (!table) throw new Error('no presence table in the staff page')
  const rows = table.match(/<tr[\s\S]*?<\/tr>/g) ?? []
  const columns = (rows[0]?.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) ?? []).map(textOf)
  const sessionOf = columns.map(c => Number(c.match(/^S(\d+)$/)?.[1] ?? NaN))
  const people = new Map<string, number[]>()
  for (const row of rows.slice(1)) {
    const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []
    const name = textOf(cells[0] ?? '')
    if (name)
      people.set(
        name,
        cells.flatMap((cell, i) => (/class=["']?dot/.test(cell) && sessionOf[i] ? [sessionOf[i]!] : [])),
      )
  }

  // Led activities: one <details> per person, one row per session and activity with its votes. The votes are
  // per session and activity, so the two leaders of a turn in pairs show the same ones: one turn, two names.
  const turns = new Map<string, FeedbackTurn>()
  for (const details of page.match(/<details[\s\S]*?<\/details>/g) ?? []) {
    const name = textOf(details.match(/class=["']?pn["']?>([\s\S]*?)<\/span>/)?.[1] ?? '')
    if (!name) continue
    if (!people.has(name)) people.set(name, [])
    for (const row of details.split(/<div class=["']?dr["']?>/).slice(1)) {
      const label = textOf(row.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? '')
      const [, session, activity] = label.match(/^S(\d+) · (.+)$/) ?? []
      const total = Number(textOf(row).match(/(\d+) vot[oi]/)?.[1] ?? NaN)
      if (!session || !activity || !Number.isFinite(total)) throw new Error(`unreadable row for ${name}: «${label}»`)
      const width = (level: string) =>
        Number(row.match(new RegExp(`width:([\\d.]+)%;background:var\\(--s${level}\\)`))?.[1] ?? 0)
      const five = Math.round((width('5') * total) / 100)
      const four = Math.round((width('4') * total) / 100)
      const votes = { five, four, low: Math.max(0, total - five - four) }
      const ctx = textOf(row.match(/class=["']?ctx["']?>([\s\S]*?)<\/div>/)?.[1] ?? '')
      const note = ctx.replace(PLAIN_LEAD, '').replace(PAIR_NOTE, '') || null

      const key = `${session}|${activity}`
      const turn = turns.get(key)
      if (!turn) {
        turns.set(key, { session: Number(session), activity, names: [name], votes, note })
        continue
      }
      if (JSON.stringify(turn.votes) !== JSON.stringify(votes))
        throw new Error(`the leaders of S${session} · ${activity} have different votes`)
      turn.names.push(name)
      if (note && note !== turn.note) turn.note = turn.note ? `${turn.note} · ${note}` : note
    }
  }
  return {
    note,
    people: [...people].map(([name, sessions]) => ({ name, sessions })),
    turns: [...turns.values()],
  }
}

export function parseFeedbackPages(pages: { feedback: string; comments: string; staff: string }): FeedbackArchive {
  return {
    ...parseFeedbackPage(pages.feedback),
    comments: parseCommentsPage(pages.comments),
    staff: parseStaffPage(pages.staff),
  }
}
