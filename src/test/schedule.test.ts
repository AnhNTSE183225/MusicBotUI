import { describe, expect, it } from 'vitest'
import {
  type ScheduleEvent, applyResponse, canManageEvent, countPendingInvites, expandEvent, getInviteeIds,
  getResponse, summarizeResponses,
} from '@/lib/schedule'

const members = [
  { id: 'a', name: 'A', avatar: '' },
  { id: 'b', name: 'B', avatar: '' },
  { id: 'c', name: 'C', avatar: '' },
]

const base: ScheduleEvent = {
  id: 'e1',
  guildId: 'g',
  title: 'Listening Party',
  description: '',
  start: '2026-11-02T19:00',
  durationMinutes: 60,
  recurrence: null,
  location: null,
  links: [],
  organizerId: 'a',
  inviteEveryone: false,
  inviteeIds: ['b'],
  seriesResponses: {},
  occurrenceResponses: {},
  cancelledOccurrences: [],
}

const range = [new Date(2026, 10, 1), new Date(2026, 11, 1)] as const

describe('schedule rules & calculations', () => {
  it('organizer or admin can manage event', () => {
    expect(canManageEvent(base, 'a', false)).toBe(true)
    expect(canManageEvent(base, 'b', false)).toBe(false)
    expect(canManageEvent(base, 'b', true)).toBe(true)
  })

  it('one-off events occur once in range', () => {
    expect(expandEvent(base, ...range)).toHaveLength(1)
  })

  it('weekly recurrence on Tue/Thu repeats on those days', () => {
    const ev: ScheduleEvent = {
      ...base,
      recurrence: { freq: 'weekly', interval: 1, weekdays: [2, 4] },
    }
    const occ = expandEvent(ev, ...range)
    expect(occ.every((o) => [2, 4].includes(o.start.getDay()))).toBe(true)
    expect(occ).toHaveLength(8)
  })

  it('count limits occurrences and cancelled dates are skipped', () => {
    const ev: ScheduleEvent = {
      ...base,
      recurrence: { freq: 'daily', interval: 1, count: 5 },
      cancelledOccurrences: ['2026-11-03'],
    }
    expect(expandEvent(ev, ...range).map((o) => o.key)).toEqual([
      '2026-11-02',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ])
  })

  it('inviting the whole server includes every member', () => {
    expect(getInviteeIds({ ...base, inviteEveryone: true }, members).sort()).toEqual(['a', 'b', 'c'])
    expect(getInviteeIds(base, members).sort()).toEqual(['a', 'b'])
  })

  it('single-event answer overrides series answer; series answer resets overrides', () => {
    const ev: ScheduleEvent = { ...base, recurrence: { freq: 'daily', interval: 1 } }
    let e = applyResponse(ev, '2026-11-02', 'b', 'accepted', 'series')
    e = applyResponse(e, '2026-11-03', 'b', 'declined', 'occurrence')
    expect(getResponse(e, '2026-11-02', 'b')).toBe('accepted')
    expect(getResponse(e, '2026-11-03', 'b')).toBe('declined')
    e = applyResponse(e, '2026-11-03', 'b', 'tentative', 'series')
    expect(getResponse(e, '2026-11-03', 'b')).toBe('tentative')
  })

  it('response summary lists people who have not responded', () => {
    const e = applyResponse(base, '2026-11-02', 'a', 'accepted', 'series')
    const g = summarizeResponses(e, '2026-11-02', members)
    expect(g.accepted.map((m) => m.id)).toEqual(['a'])
    expect(g.pending.map((m) => m.id)).toEqual(['b'])
  })

  it('pending invite count ignores events the user is not invited to', () => {
    const soon = new Date(Date.now() + 86400000)
    const start = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}T12:00`
    const ev: ScheduleEvent = { ...base, start }
    expect(countPendingInvites([ev], 'b', members)).toBe(1)
    expect(countPendingInvites([ev], 'c', members)).toBe(0)
  })
})
