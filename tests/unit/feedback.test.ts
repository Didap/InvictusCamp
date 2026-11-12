import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { feedbackArchiveSchema } from '~~/shared/schemas/feedback'
import type { FeedbackArchive } from '~~/shared/types/feedback'
import { itemResults, personTurns, respondents, turnsByActivity, voteShares } from '~~/shared/utils/feedback'
import { decodeEntities, parseFeedbackPages } from '~~/scripts/lib/feedback-pages'

const json = (id: string, data: unknown) =>
  `<html><script type="application/json" id="${id}">${JSON.stringify(data)}</script><script>const x = 1</script></html>`

const feedbackPage = json('fd', {
  n: { 2: 2, 1: 3 },
  r: [
    [1, 0, 'Piscina', 5],
    [1, 0, 'Piscina', 4],
    [1, 1, 'Staff', 5],
    [2, 0, 'Arte', 2],
    [2, 0, 'Piscina', 5],
  ],
  temi: [{ tema: 'Più piscina', count: 2, sessioni: [1, 2], dettaglio: 'Più turni.' }],
})
const commentsPage =
  `<script type="application/json" id="data-2025">{"cats":["Vecchie"],"items":[]}</script>` +
  `<script type="application/json" data-id="data">{"cats":["Altre"],"items":[]}</script>` +
  json('data', {
    cats: ['Suggerimenti', 'Messaggi'],
    items: [
      { s: 2, f: 4, c: 1, t: ' Grazie! ' },
      { s: 1, f: 2, c: 0, t: '   ' },
    ],
  })
const dot = '<td class="c"><span class=dot></span></td>'
const empty = '<td class="c"></td>'
const staffPage = `<p>Non sono contati Nicola e Serena.</p>
<table><tr><th>Nome</th><th>S1</th><th>S2</th><th>Totale</th></tr>
<tr><td class="nm">Anna Rossi</td>${dot}${dot}<td class="n"><b>2</b></td></tr>
<tr><td class="nm">Luca Neri</td>${empty}${dot}<td class="n"><b>1</b></td></tr></table>
<details class="pc"><summary><span class="pn">Luca Neri</span></summary>
<div class="dr"><div class="dl"><b>S2 &middot; Arte</b><span>1 voto</span></div><div class="sb"><i style="width:100.00%;background:var(--s4)"></i></div><div class="ctx">voto solo per questa attività · condotta in coppia con Anna Rossi</div></div>
</details>
<details class="pc"><summary><span class="pn">Anna Rossi</span></summary>
<div class="dr"><div class="dl"><b>S1 · Tiro con l&#x27;arco</b><span>4 voti</span></div><div class="sb"><i style="width:75.00%;background:var(--s5)"></i><i style="width:25.00%;background:var(--s3)"></i></div><div class="ctx">voto solo per questa attività</div></div>
<div class="dr"><div class="dl"><b>S2 · Arte</b><span>1 voto</span></div><div class="sb"><i style="width:100.00%;background:var(--s4)"></i></div><div class="ctx">voto unico per &quot;Arte e Arco&quot;, insieme a Arco (Luca)</div></div>
</details>`

const archive = parseFeedbackPages({ feedback: feedbackPage, comments: commentsPage, staff: staffPage })

describe('reading the 2026 pages', () => {
  it('reads sessions, questions, votes and themes from the feedback JSON', () => {
    expect(archive.sessions).toEqual([
      { number: 1, respondents: 3 },
      { number: 2, respondents: 2 },
    ])
    expect(archive.items).toEqual([
      { label: 'Piscina', kind: 'activity' },
      { label: 'Staff', kind: 'other' },
      { label: 'Arte', kind: 'activity' },
    ])
    expect(archive.votes[3]).toEqual([2, 2, 2])
    expect(archive.themes).toEqual([{ title: 'Più piscina', families: 2, sessions: [1, 2], detail: 'Più turni.' }])
  })

  it('reads the comments', () => {
    expect(archive.comments).toEqual({
      questions: ['Suggerimenti', 'Messaggi'],
      items: [{ session: 2, family: 4, question: 1, text: 'Grazie!' }],
    })
  })

  it('reads presences and turns from the staff HTML, votes back from the bar widths', () => {
    expect(archive.staff.note).toBe('Non sono contati Nicola e Serena.')
    expect(archive.staff.people).toEqual([
      { name: 'Anna Rossi', sessions: [1, 2] },
      { name: 'Luca Neri', sessions: [2] },
    ])
    // The turn in pairs is one, with both names; the note that only names the partner goes.
    expect(archive.staff.turns).toEqual([
      {
        session: 2,
        activity: 'Arte',
        names: ['Luca Neri', 'Anna Rossi'],
        votes: { five: 0, four: 1, low: 0 },
        note: 'voto unico per "Arte e Arco", insieme a Arco (Luca)',
      },
      {
        session: 1,
        activity: "Tiro con l'arco",
        names: ['Anna Rossi'],
        votes: { five: 3, four: 0, low: 1 },
        note: null,
      },
    ])
    expect(feedbackArchiveSchema.safeParse(archive).success).toBe(true)
  })

  it('refuses two leaders of a turn with different votes', () => {
    const different = staffPage.replace('width:100.00%;background:var(--s4)', 'width:100.00%;background:var(--s5)')
    expect(() => parseFeedbackPages({ feedback: feedbackPage, comments: commentsPage, staff: different })).toThrow(
      'the leaders of S2 · Arte have different votes',
    )
  })

  it('decodes HTML entities', () => {
    expect(decodeEntities('l&#x27;arco &amp; &#232; &quot;x&quot; &egrave; &middot; &unknown; &#x110000;')).toBe(
      'l\'arco & è "x" è · &unknown; &#x110000;',
    )
  })

  it('refuses a page without its JSON', () => {
    expect(() => parseFeedbackPages({ feedback: '<html></html>', comments: commentsPage, staff: staffPage })).toThrow(
      'no JSON block "fd"',
    )
  })
})

describe('the sums of the page', () => {
  it('counts votes per question for the year or one session, the most liked first', () => {
    expect(itemResults(archive, null)).toEqual([
      { label: 'Staff', kind: 'other', votes: { five: 1, four: 0, low: 0 } },
      { label: 'Piscina', kind: 'activity', votes: { five: 2, four: 1, low: 0 } },
      { label: 'Arte', kind: 'activity', votes: { five: 0, four: 0, low: 1 } },
    ])
    expect(itemResults(archive, 2).map(r => r.label)).toEqual(['Piscina', 'Arte'])
    expect(respondents(archive, null)).toBe(5)
    expect(respondents(archive, 2)).toBe(2)
    expect(voteShares({ five: 2, four: 1, low: 0 })).toEqual({ five: 67, four: 33, low: 0 })
  })

  it('groups the turns by activity, in the order of the questionnaire, and sums those of a person', () => {
    expect(turnsByActivity(archive).map(a => [a.activity, a.turns.map(t => `S${t.session}`)])).toEqual([
      ['Arte', ['S2']],
      ["Tiro con l'arco", ['S1']],
    ])
    const anna = personTurns(archive, 'Anna Rossi')
    expect(anna.turns.map(t => t.session)).toEqual([1, 2])
    expect(anna.votes).toEqual({ five: 3, four: 1, low: 1 })
    expect(anna.activities).toEqual(["Tiro con l'arco", 'Arte'])
  })
})

describe('feedbackArchiveSchema', () => {
  it('refuses a vote or a comment that names what is not there', () => {
    const broken: FeedbackArchive = { ...archive, votes: [[9, 0, 5]] }
    expect(feedbackArchiveSchema.safeParse(broken).success).toBe(false)
    const comment = { ...archive.comments, items: [{ session: 1, family: 1, question: 7, text: 'x' }] }
    expect(feedbackArchiveSchema.safeParse({ ...archive, comments: comment }).success).toBe(false)
    const stranger = { ...archive.staff, turns: [{ ...archive.staff.turns[0]!, names: ['Nessuno'] }] }
    expect(feedbackArchiveSchema.safeParse({ ...archive, staff: stranger }).success).toBe(false)
  })
})

describe('scripts/import-feedback.mjs', () => {
  it('loads its .ts modules under plain Node', () => {
    const run = spawnSync(process.execPath, ['scripts/import-feedback.mjs'], {
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    })
    expect(run.stderr.trim()).toBe('import-feedback: name the folder with the saved pages')
  })
})
