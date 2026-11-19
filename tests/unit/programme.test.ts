// Pure rules of the week programme: the model week passes its own schema, what families and staff
// receive, the rotation check, the open points, the placement of a block and the dates of the days.
import { describe, expect, it } from 'vitest'
import { programmeForViewer, programmePdfBlocks } from '~~/server/domain/programmes'
import { emptyWeek, programmeTemplate } from '~~/shared/content/programme-template'
import { programmeBlockSchema, programmeContentSchema } from '~~/shared/schemas/programmes'
import type { ProgrammeBlock, ProgrammeContent } from '~~/shared/types/domain'
import { formatDay } from '~~/shared/utils/format'
import {
  blockTime,
  canFamilyReadProgramme,
  dayCaptions,
  nextDayName,
  weekdayOfName,
  groupRotation,
  moveBlock,
  openPoints,
  placeBlock,
} from '~~/shared/utils/programme'
import { newId, sameContent } from '~~/shared/utils/plain'

const block = (values: Partial<ProgrammeBlock>): ProgrammeBlock => ({
  id: crypto.randomUUID(),
  start: '',
  end: '',
  title: 'Blocco',
  kind: 'everyone',
  note: '',
  staffNote: '',
  lead: '',
  toConfirm: false,
  ...values,
})

describe('model week', () => {
  it('passes the schema it is saved with, with 5 days and 6 activities', () => {
    const template = programmeTemplate()
    expect(programmeContentSchema.parse(template)).toEqual(template)
    expect(template.days.map(day => day.name)).toEqual(['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì'])
    expect(template.activities).toHaveLength(6)
  })

  it('keeps the comparisons with 2026 out of the notes families read', () => {
    const notes = programmeTemplate().days.flatMap(day => day.blocks.map(b => b.note))
    expect(notes.some(note => note.includes('2026'))).toBe(false)
  })

  it('gives every group each activity once', () => {
    for (const row of groupRotation(programmeTemplate())) {
      expect(row.missing).toEqual([])
      expect(row.repeated).toEqual([])
    }
  })

  it('is a fresh copy at every call', () => {
    const a = programmeTemplate()
    a.days[0]!.blocks = []
    expect(programmeTemplate().days[0]!.blocks.length).toBeGreaterThan(0)
    expect(programmeContentSchema.parse(emptyWeek()).days).toHaveLength(5)
  })
})

describe('block schema', () => {
  it('refuses an end before the start, and an end without a start', () => {
    expect(programmeBlockSchema.safeParse(block({ start: '10:00', end: '09:00' })).success).toBe(false)
    expect(programmeBlockSchema.safeParse(block({ end: '09:00' })).success).toBe(false)
    expect(programmeBlockSchema.safeParse(block({ start: '9:00' })).success).toBe(false)
    expect(programmeBlockSchema.safeParse(block({ start: '20:00' })).success).toBe(true)
  })

  it('gives a groups block every turn and drops the turns from other kinds', () => {
    const groups = programmeBlockSchema.parse(block({ kind: 'groups' }))
    expect(groups.groups?.red).toEqual({ activity: null, lead: '' })
    const meal = programmeBlockSchema.parse(block({ kind: 'meal', groups: groups.groups }))
    expect('groups' in meal).toBe(false)
  })

  it('refuses two activities with the same name', () => {
    const content: ProgrammeContent = { ...emptyWeek(), activities: ['Spiaggia', 'spiaggia'] }
    expect(programmeContentSchema.safeParse(content).success).toBe(false)
  })
})

describe('programmeForViewer', () => {
  const content: ProgrammeContent = {
    activities: [],
    days: [
      {
        id: 'lun',
        name: 'Lunedì',
        subtitle: '',
        blocks: [
          block({ title: 'Briefing', kind: 'staff', staffNote: 'Sala riunioni' }),
          block({ title: 'Pranzo', kind: 'meal', toConfirm: true, staffNote: 'Tavoli in veranda' }),
        ],
      },
    ],
  }

  it('families get no staff blocks and no internal notes', () => {
    const blocks = programmeForViewer(content, 'family').days[0]!.blocks
    expect(blocks.map(b => b.title)).toEqual(['Pranzo'])
    expect(blocks[0]).toMatchObject({ staffNote: '', toConfirm: true })
  })

  it('staff get every block and the internal notes', () => {
    const blocks = programmeForViewer(content, 'staff').days[0]!.blocks
    expect(blocks.map(b => b.title)).toEqual(['Briefing', 'Pranzo'])
    expect(blocks[1]).toMatchObject({ staffNote: 'Tavoli in veranda' })
  })
})

describe('editor helpers', () => {
  it('formats the time of a block', () => {
    expect(blockTime({ start: '10:00', end: '12:30' })).toBe('10:00–12:30')
    expect(blockTime({ start: '20:00', end: '' })).toBe('20:00')
    expect(blockTime({ start: '', end: '' })).toBe('')
  })

  it('places a block by its start, leaving blocks without a time where they are', () => {
    const blocks = [block({ id: 'a' }), block({ id: 'b', start: '10:00' }), block({ id: 'c' })]
    expect(placeBlock(blocks, block({ id: 'x', start: '09:00' })).map(b => b.id)).toEqual(['a', 'x', 'b', 'c'])
    expect(placeBlock(blocks, block({ id: 'x', start: '11:00' })).map(b => b.id)).toEqual(['a', 'b', 'c', 'x'])
    expect(placeBlock(blocks, block({ id: 'x' })).map(b => b.id)).toEqual(['a', 'b', 'c', 'x'])
  })

  it('lists blocks to confirm and groups without an activity', () => {
    const content = programmeTemplate()
    content.days[0]!.blocks[0]!.toConfirm = true
    content.days[1]!.blocks[1]!.groups!.red.activity = null
    expect(openPoints(content).map(point => point.text)).toEqual([
      'Lunedì 08:00–10:30: Arrivo staff e pre-sessione, da confermare',
      'Martedì 10:00–12:30: un gruppo senza attività',
    ])
  })

  it('flags an activity done twice and one never done', () => {
    const content = programmeTemplate()
    const turns = content.days[1]!.blocks[1]!.groups!
    const twice = content.days[0]!.blocks.find(b => b.kind === 'groups')!.groups!.yellow.activity
    const lost = turns.yellow.activity
    turns.yellow.activity = twice
    const yellow = groupRotation(content).find(row => row.group === 'yellow')!
    expect(yellow.repeated).toEqual([twice])
    expect(yellow.missing).toEqual([lost])
  })

  it('moves a dragged block within its day and to another day', () => {
    const content = programmeTemplate()
    const titles = (id: string) => content.days.find(day => day.id === id)!.blocks.map(b => b.title)
    const [first, second] = titles('ven')
    moveBlock(content, { from: 'ven', oldIndex: 0, to: 'ven', newIndex: 1 })
    expect(titles('ven').slice(0, 2)).toEqual([second, first])
    moveBlock(content, { from: 'ven', oldIndex: 0, to: 'lun', newIndex: 0 })
    expect(titles('lun')[0]).toBe(second)
    expect(titles('ven')).not.toContain(second)
  })

  it('flags turns whose activity left the list', () => {
    const content = programmeTemplate()
    const gone = content.activities.shift()!
    for (const row of groupRotation(content)) expect(row.unlisted).toEqual([gone])
  })

  it('compares two weeks whatever the order of their keys', () => {
    const a = programmeTemplate()
    const b = programmeTemplate()
    const { id, title, ...rest } = b.days[0]!.blocks[0]!
    b.days[0]!.blocks[0] = { ...rest, title, id }
    expect(sameContent(a, b)).toBe(true)
    b.days[0]!.blocks[0]!.title = 'Altro'
    expect(sameContent(a, b)).toBe(false)
  })

  it('makes distinct block ids and shares the reading rule of families', () => {
    expect(newId('b')).not.toBe(newId('b'))
    expect(canFamilyReadProgramme('invited', 'inviting')).toBe(true)
    expect(canFamilyReadProgramme('confirmed', 'cancelled')).toBe(false)
    expect(canFamilyReadProgramme('declined', 'confirmed')).toBe(false)
  })

  it('captions the days with the dates only when they fall on the weekdays the days are named after', () => {
    const week = emptyWeek()
    week.days[0]!.subtitle = 'Arrivo'
    const seven = ['2027-06-21', '2027-06-22', '2027-06-23', '2027-06-24', '2027-06-25', '2027-06-26', '2027-06-27']
    const undated = ['Arrivo', '', '', '', '']
    const dated = dayCaptions(week, seven)
    expect(dated[0]).toBe(`${formatDay('2027-06-21', 'long')} · Arrivo`)
    expect(dated.slice(1)).toEqual(seven.slice(1, 5).map(day => formatDay(day, 'long')))
    expect(dayCaptions(week, seven.slice(0, 3))).toEqual(undated)
    expect(dayCaptions(week, ['2027-06-20', ...seven.slice(0, 5)])).toEqual(undated)
    expect(dayCaptions(week, undefined)).toEqual(undated)

    // A weekend from Friday: dated on a Friday-to-Sunday session, not on a week.
    const weekend: ProgrammeContent = {
      days: ['Venerdì', 'Sabato', 'domenica'].map(name => ({ id: name, name, subtitle: '', blocks: [] })),
      activities: [],
    }
    const friday = ['2027-04-16', '2027-04-17', '2027-04-18']
    expect(dayCaptions(weekend, friday)).toEqual(friday.map(day => formatDay(day, 'long')))
    expect(dayCaptions(weekend, seven)).toEqual(['', '', ''])
    // Days named otherwise take any dates; one weekday name among them still has to match.
    const free: ProgrammeContent = {
      ...weekend,
      days: weekend.days.map((day, i) => ({ ...day, name: `Giorno ${i + 1}` })),
    }
    expect(dayCaptions(free, seven)[0]).toBe(formatDay(seven[0]!, 'long'))
    free.days[2]!.name = 'Sabato sera'
    expect(dayCaptions(free, seven)).toEqual(['', '', ''])
    expect(dayCaptions(free, ['2027-06-24', ...seven.slice(4)])[2]).toBe(formatDay('2027-06-26', 'long'))
  })

  it('reads the weekday of a day name and suggests the name of the next day', () => {
    expect(['Lunedì', 'lunedi', 'MERCOLEDÌ pomeriggio', 'Domenica'].map(weekdayOfName)).toEqual([0, 0, 2, 6])
    expect(['Giorno 1', 'Arrivo', '', 'Lunedìssimo'].map(weekdayOfName)).toEqual([-1, -1, -1, -1])
    const week = emptyWeek()
    expect(nextDayName(week)).toBe('Sabato')
    week.days[4]!.name = 'Domenica'
    expect(nextDayName(week)).toBe('')
    week.days[4]!.name = 'Arrivo'
    expect(nextDayName(week)).toBe('Giorno 6')
    expect(nextDayName({ days: [], activities: [] })).toBe('Giorno 1')
  })
})

describe('programme PDF', () => {
  it('lists the week day by day, each block with its kind, lead, note and groups, never the internal note', () => {
    const week = emptyWeek()
    week.days[0]!.subtitle = 'Arrivo'
    week.days[0]!.blocks = [
      block({
        start: '15:00',
        end: '17:00',
        title: 'Accoglienza',
        kind: 'welcome',
        lead: 'Nicola',
        note: 'Portate le lenzuola.',
        staffNote: 'Chiavi in segreteria',
        toConfirm: true,
      }),
      block({
        start: '17:30',
        title: 'Attività',
        kind: 'groups',
        groups: {
          yellow: { activity: 'Piscina', lead: 'Marco' },
          red: { activity: null, lead: '' },
          blue: { activity: 'Musica', lead: '' },
        },
      }),
      block({ title: 'Cena', kind: 'meal' }),
    ]
    const monday = ['2027-06-21', '2027-06-22', '2027-06-23', '2027-06-24', '2027-06-25']
    const blocks = programmePdfBlocks(week, monday)
    expect(blocks.slice(0, 9)).toEqual([
      { heading: `Lunedì · ${formatDay('2027-06-21', 'long')} · Arrivo` },
      { label: '15:00–17:00 · Accoglienza (da confermare)' },
      'Accoglienza, con Nicola\nPortate le lenzuola.',
      { label: '17:30 · Attività' },
      'Attività a gruppi\nGiallo: Piscina, con Marco\nRosso: da definire\nBlu: Musica',
      { label: 'Cena' },
      'Pasto',
      { heading: `Martedì · ${formatDay('2027-06-22', 'long')}` },
      'Niente in programma.',
    ])
    expect(JSON.stringify(blocks)).not.toContain('Chiavi')
    // A session that does not start on Monday: the days without dates.
    expect(programmePdfBlocks(week, ['2027-06-19', ...monday])[7]).toEqual({ heading: 'Martedì' })
  })
})
