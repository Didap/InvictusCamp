// Pure rules of the staff area: what an application lacks, the moves of a review, the derived
// "Confermata", the schemas shared with the forms, and the emails.
import { describe, expect, it } from 'vitest'
import { contractState, isConfirmed } from '~~/server/domain/staff'
import {
  convocationCancelledEmail,
  convocationEmail,
  defaultOutcomeMessage,
  messageParagraphs,
  staffOutcomeEmail,
} from '~~/server/emails/staff'
import {
  APPLICATION_CHECKLIST,
  STAFF_DOCUMENT_CATEGORIES,
  STAFF_STATUS_MOVES,
  applicationMissing,
  availabilityAnswerSchema,
  canMoveStaff,
  countsTowardNeeded,
  isReviewMove,
  staffApplicationSchema,
  staffDocumentSchema,
} from '#shared/schemas/staff'
import { STAFF_STATUSES } from '#shared/utils/constants'
import { addDays, todayIso } from '#shared/utils/dates'

const ctx = { appUrl: 'https://gestionale.test' }
const session = {
  id: 's1',
  title: 'Sessione 1 · Giugno 2027',
  startDate: '2027-06-21',
  endDate: '2027-06-27',
  location: 'Invictus Camp, Maruggio (TA)',
}

describe('application', () => {
  const empty = { birthDate: null, city: null, roles: [], qualifications: null, experience: null, motivation: null }

  it('lists what is missing in the order of the form', () => {
    expect(applicationMissing(empty)).toEqual([...APPLICATION_CHECKLIST])
    expect(
      applicationMissing({
        ...empty,
        birthDate: '1990-01-01',
        city: '  ',
        roles: ['activity_lead'],
        qualifications: 'OSS',
        experience: 'Sì',
        motivation: 'Sì',
        cvFileId: 'f1',
      }),
    ).toEqual(['Città'])
  })

  it('the full schema refuses a future birth date, an empty list of roles and an unknown team', () => {
    const valid = {
      team: 'volunteer',
      birthDate: '1995-04-10',
      city: 'Lecce',
      roles: ['group_lead'],
      qualifications: 'Laurea',
      experience: 'Centri estivi',
      motivation: 'Esserci',
    }
    expect(staffApplicationSchema.safeParse(valid).success).toBe(true)
    expect(staffApplicationSchema.safeParse({ ...valid, birthDate: addDays(todayIso(), 1) }).success).toBe(false)
    expect(staffApplicationSchema.safeParse({ ...valid, birthDate: '1995-02-30' }).success).toBe(false)
    expect(staffApplicationSchema.safeParse({ ...valid, roles: [] }).success).toBe(false)
    expect(staffApplicationSchema.safeParse({ ...valid, roles: ['chef'] }).success).toBe(false)
    expect(staffApplicationSchema.safeParse({ ...valid, team: 'cucina' }).success).toBe(false)
    const { team: _team, ...withoutTeam } = valid
    expect(staffApplicationSchema.safeParse(withoutTeam).success).toBe(false)
  })
})

describe('review', () => {
  it('allows only the moves of spec 3.4', () => {
    const allowed = STAFF_STATUSES.flatMap(from =>
      STAFF_STATUSES.filter(to => canMoveStaff(from, to)).map(to => `${from}>${to}`),
    )
    expect(allowed.sort()).toEqual(
      ['applied>approved', 'applied>rejected', 'approved>inactive', 'inactive>approved', 'rejected>approved'].sort(),
    )
    expect(STAFF_STATUS_MOVES.registered).toEqual([])
  })

  it('records as a review only the decisions on an application', () => {
    expect(isReviewMove('applied', 'approved')).toBe(true)
    expect(isReviewMove('rejected', 'approved')).toBe(true)
    expect(isReviewMove('approved', 'inactive')).toBe(false)
    expect(isReviewMove('inactive', 'approved')).toBe(false)
  })
})

describe('convocation', () => {
  it('reads "Confermata" when accepted and the contract, if any, is signed', () => {
    expect(contractState(null, undefined)).toBe('none')
    expect(contractState('d1', undefined)).toBe('missing')
    expect(contractState('d1', { status: 'cancelled' })).toBe('missing')
    expect(contractState('d1', { status: 'pending' })).toBe('pending')
    expect(contractState('d1', { status: 'signed' })).toBe('signed')
    expect(isConfirmed('accepted', 'none')).toBe(true)
    expect(isConfirmed('accepted', 'signed')).toBe(true)
    expect(isConfirmed('accepted', 'pending')).toBe(false)
    expect(isConfirmed('accepted', 'missing')).toBe(false)
    expect(isConfirmed('sent', 'none')).toBe(false)
  })
})

describe('staffNeeded', () => {
  it('counts the staff team, coordinators and v-team aside', () => {
    expect(countsTowardNeeded({ team: 'staff', role: 'group_lead' })).toBe(true)
    expect(countsTowardNeeded({ team: 'staff', role: null })).toBe(true)
    expect(countsTowardNeeded({ team: 'staff', role: 'coordinator' })).toBe(false)
    expect(countsTowardNeeded({ team: 'volunteer', role: 'other' })).toBe(false)
  })
})

describe('availability schema', () => {
  it('is a yes or a no for the whole session', () => {
    expect(availabilityAnswerSchema.safeParse({ available: true }).success).toBe(true)
    expect(availabilityAnswerSchema.safeParse({ available: false }).success).toBe(true)
    expect(availabilityAnswerSchema.safeParse({ available: 'sì' }).success).toBe(false)
    expect(availabilityAnswerSchema.safeParse({}).success).toBe(false)
  })
})

describe('personal documents', () => {
  it('staff cannot file a diagnosis', () => {
    expect(STAFF_DOCUMENT_CATEGORIES).not.toContain('diagnosis')
    expect(staffDocumentSchema.safeParse({ category: 'diagnosis', title: 'X' }).success).toBe(false)
    expect(staffDocumentSchema.safeParse({ category: 'certification', title: 'BLSD' }).success).toBe(true)
    expect(staffDocumentSchema.safeParse({ category: 'certification', title: '  ' }).success).toBe(false)
  })
})

describe('emails', () => {
  it('splits a message written in the dashboard into paragraphs', () => {
    expect(messageParagraphs('Prima riga\nstessa frase.\n\n\nSecondo paragrafo.\n')).toEqual([
      'Prima riga stessa frase.',
      'Secondo paragrafo.',
    ])
    expect(messageParagraphs('   ')).toEqual([])
  })

  it('the outcome email carries the message as written, escaped', () => {
    const approved = staffOutcomeEmail(ctx, {
      to: 'rita@example.com',
      toUserId: 'u1',
      firstName: 'Rita',
      template: 'staff.approved',
      message: 'Benvenuta <b>nello</b> staff.\n\nA presto.',
    })
    expect(approved.template).toBe('staff.approved')
    expect(approved.html).toContain('Ciao Rita,')
    expect(approved.html).toContain('Benvenuta &lt;b&gt;nello&lt;/b&gt; staff.')
    expect(approved.html).toContain('https://gestionale.test/staff')
    expect(approved.text).toContain('A presto.')
    expect(approved.sensitive).toBeFalsy()

    const rejected = staffOutcomeEmail(ctx, {
      to: 'rita@example.com',
      toUserId: 'u1',
      firstName: 'Rita',
      template: 'staff.rejected',
      message: defaultOutcomeMessage('staff.rejected'),
    })
    expect(rejected.template).toBe('staff.rejected')
    expect(rejected.html).not.toContain('https://gestionale.test/staff')
  })

  it('the proposed outcome messages use the "tu" form and no em dashes', () => {
    for (const template of ['staff.approved', 'staff.rejected'] as const) {
      const message = defaultOutcomeMessage(template)
      expect(message).not.toMatch(/—/)
      expect(message).toMatch(/\b(tua|tuoi|ti|hai)\b/i)
    }
  })

  it('the convocation tells session, dates, place, role and the message, and links to the answer', () => {
    const email = convocationEmail(ctx, {
      to: 'chiara@example.com',
      toUserId: 'u2',
      firstName: 'Chiara',
      session,
      role: 'group_lead',
      message: 'Ti aspettiamo.',
    })
    expect(email).toMatchObject({ template: 'staff.convocation', sessionId: 's1' })
    expect(email.subject).toContain('Sessione 1 · Giugno 2027')
    expect(email.html).toContain('21–27 giugno 2027')
    expect(email.html).toContain('Responsabile di gruppo')
    expect(email.html).toContain('Ti aspettiamo.')
    expect(email.html).toContain('https://gestionale.test/staff/convocazioni')
  })

  it('the cancellation is its own template and keeps the session', () => {
    const email = convocationCancelledEmail(ctx, {
      to: 'chiara@example.com',
      toUserId: 'u2',
      firstName: 'Chiara',
      session,
      role: null,
    })
    expect(email).toMatchObject({ template: 'staff.convocation_cancelled', sessionId: 's1' })
    expect(email.html).not.toContain('Ruolo')
  })
})
