import { describe, expect, it } from 'vitest'
import { forwardedClientIp } from '~~/server/domain/client-ip'
import { SESSION_STATUSES } from '#shared/utils/constants'
import { areaRole, isPublicPath, safeRedirect } from '#shared/utils/routes'
import { SESSION_TRANSITIONS, canTransition } from '#shared/utils/session-status'
import { freeSlots, nextReserve, nextReserveRank, slotSummary, type SlotParticipation } from '#shared/utils/slots'

describe('session status', () => {
  it('allows only the documented moves', () => {
    expect(canTransition('draft', 'inviting')).toBe(true)
    expect(canTransition('inviting', 'confirmed')).toBe(true)
    expect(canTransition('confirmed', 'completed')).toBe(true)
    expect(canTransition('draft', 'confirmed')).toBe(false)
    expect(canTransition('inviting', 'draft')).toBe(false)
    for (const status of SESSION_STATUSES) expect(canTransition(status, status)).toBe(false)
  })

  it('ends in completed or cancelled', () => {
    expect(SESSION_TRANSITIONS.completed).toEqual([])
    expect(SESSION_TRANSITIONS.cancelled).toEqual([])
    for (const status of ['draft', 'inviting', 'confirmed'] as const) {
      expect(canTransition(status, 'cancelled')).toBe(true)
    }
  })
})

describe('slots', () => {
  const p = (
    id: string,
    kind: 'slot' | 'reserve',
    status: SlotParticipation['status'],
    reserveRank: number | null = null,
  ): SlotParticipation => ({ id, kind, status, reserveRank, createdAt: '2026-10-01T00:00:00Z' })
  const list = [
    p('a', 'slot', 'confirmed'),
    p('b', 'slot', 'invited'),
    p('c', 'slot', 'declined'),
    p('r2', 'reserve', 'invited', 2),
    p('r1', 'reserve', 'invited', 1),
    p('r0', 'reserve', 'cancelled', 0),
  ]

  it('counts the places held by titolari', () => {
    expect(freeSlots(3, list)).toBe(1)
    expect(slotSummary(3, list)).toEqual({ total: 3, held: 2, confirmed: 1, free: 1, reserves: 2 })
  })

  it('calls reserves in rank order and appends new ones at the end', () => {
    expect(nextReserve(list)?.id).toBe('r1')
    expect(nextReserveRank(list)).toBe(3)
    expect(nextReserve([p('x', 'slot', 'confirmed')])).toBeUndefined()
  })
})

describe('routes', () => {
  it('maps paths to role areas', () => {
    expect(areaRole('/admin/sessioni')).toBe('admin')
    expect(areaRole('/famiglia')).toBe('family')
    expect(areaRole('/staffing')).toBeNull()
    expect(areaRole('/account')).toBeNull()
  })

  it('knows the public pages', () => {
    expect(isPublicPath('/accedi')).toBe(true)
    expect(isPublicPath('/invito')).toBe(true)
    expect(isPublicPath('/admin')).toBe(false)
  })

  it('redirects only inside the site', () => {
    expect(safeRedirect('/admin/sessioni?x=1', '/admin')).toBe('/admin/sessioni?x=1')
    expect(safeRedirect('//evil.example', '/admin')).toBe('/admin')
    expect(safeRedirect('/\\evil.example', '/admin')).toBe('/admin')
    expect(safeRedirect('https://evil.example', '/admin')).toBe('/admin')
    expect(safeRedirect(undefined, '/admin')).toBe('/admin')
  })
})

describe('client address', () => {
  it('takes the entry the proxy appended, never one the client wrote', () => {
    expect(forwardedClientIp('203.0.113.7', '10.0.1.5')).toBe('203.0.113.7')
    expect(forwardedClientIp('1.2.3.4, 198.51.100.9', '10.0.1.5')).toBe('198.51.100.9')
    expect(forwardedClientIp('forged, 1.2.3.4 ,2001:db8::1 ', '10.0.1.5')).toBe('2001:db8::1')
  })

  it('falls back to the socket without the header or with an empty last entry', () => {
    expect(forwardedClientIp(undefined, '127.0.0.1')).toBe('127.0.0.1')
    expect(forwardedClientIp('', '127.0.0.1')).toBe('127.0.0.1')
    expect(forwardedClientIp('1.2.3.4, ', '127.0.0.1')).toBe('127.0.0.1')
    expect(forwardedClientIp(null, undefined)).toBeNull()
  })
})
