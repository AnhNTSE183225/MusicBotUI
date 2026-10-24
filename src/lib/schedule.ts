/**
 * Server schedule — types, pure recurrence/RSVP rules, and a reactive store
 * connected to the live backend API.
 */
import { useEffect, useState, useCallback, useSyncExternalStore } from 'react'
import {
  addDays, addMinutes, differenceInCalendarMonths, differenceInCalendarWeeks,
  format, isAfter, isBefore, parseISO, startOfDay,
} from 'date-fns'
import {
  getSchedule, createScheduleEvent, updateScheduleEvent, deleteScheduleEvent, respondScheduleEvent,
  type ScheduleEvent, type ServerMember, type ServerChannel, type ScheduleEventLocation,
  type ScheduleEventRecurrence, type ScheduleEventLink, type RsvpStatus, type RsvpScope,
  type EventCategory,
} from '@/lib/api'

export type {
  ScheduleEvent, ServerMember, ServerChannel, ScheduleEventLocation as EventLocation,
  ScheduleEventRecurrence as Recurrence, ScheduleEventLink as EventLink, RsvpStatus, RsvpScope,
  EventCategory,
}

export interface Occurrence {
  event: ScheduleEvent
  key: string // yyyy-MM-dd
  start: Date
  end: Date
}

// ---------------------------------------------------------------------------
// Pure recurrence and RSVP calculation rules
// ---------------------------------------------------------------------------

export const occurrenceKey = (d: Date) => format(d, 'yyyy-MM-dd')

export function canManageEvent(event: ScheduleEvent, userId: string, isAdmin = false) {
  return event.organizerId === userId || isAdmin
}

/** All occurrences of an event whose start falls in [from, to). */
export function expandEvent(event: ScheduleEvent, from: Date, to: Date): Occurrence[] {
  const first = parseISO(event.start)
  const make = (start: Date): Occurrence => ({
    event, key: occurrenceKey(start), start, end: addMinutes(start, event.durationMinutes),
  })
  const r = event.recurrence
  if (!r) {
    return !isBefore(first, from) && isBefore(first, to) && !(event.cancelledOccurrences || []).includes(occurrenceKey(first))
      ? [make(first)] : []
  }
  const interval = Math.max(1, r.interval || 1)
  const until = r.until ? addDays(startOfDay(parseISO(r.until)), 1) : null
  const weekdays = r.freq === 'weekly' && r.weekdays?.length ? r.weekdays : [first.getDay()]
  const out: Occurrence[] = []
  let produced = 0
  const time = { h: first.getHours(), m: first.getMinutes() }
  for (let i = 0; i < 3660; i++) {
    const day = addDays(startOfDay(first), i)
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.h, time.m)
    if (!isBefore(start, to)) break
    if (until && !isBefore(start, until)) break
    let matches = false
    if (r.freq === 'daily') matches = i % interval === 0
    else if (r.freq === 'weekly') matches = weekdays.includes(day.getDay()) && differenceInCalendarWeeks(day, first) % interval === 0
    else matches = day.getDate() === first.getDate() && differenceInCalendarMonths(day, first) % interval === 0
    if (!matches) continue
    produced++
    if (r.count && produced > r.count) break
    if ((event.cancelledOccurrences || []).includes(occurrenceKey(start))) continue
    if (!isBefore(start, from)) out.push(make(start))
  }
  return out
}

export function expandEvents(events: ScheduleEvent[], from: Date, to: Date): Occurrence[] {
  return events.flatMap((e) => expandEvent(e, from, to)).sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** People invited to the event (organizer always included). */
export function getInviteeIds(event: ScheduleEvent, members: ServerMember[]) {
  const ids = event.inviteEveryone ? members.map((m) => m.id) : (event.inviteeIds || [])
  return Array.from(new Set([event.organizerId, ...ids]))
}

export function isInvited(event: ScheduleEvent, userId: string, members: ServerMember[]) {
  return getInviteeIds(event, members).includes(userId)
}

/** A single-occurrence answer overrides the whole-series answer. */
export function getResponse(event: ScheduleEvent, key: string, userId: string): RsvpStatus | null {
  return event.occurrenceResponses?.[key]?.[userId] ?? event.seriesResponses?.[userId] ?? null
}

export function applyResponse(
  event: ScheduleEvent,
  key: string,
  userId: string,
  status: RsvpStatus,
  scope: RsvpScope
): ScheduleEvent {
  if (scope === 'series' || !event.recurrence) {
    const occurrenceResponses = Object.fromEntries(
      Object.entries(event.occurrenceResponses || {}).map(([k, v]) => {
        const { [userId]: _drop, ...rest } = v
        return [k, rest]
      }),
    )
    return {
      ...event,
      seriesResponses: { ...(event.seriesResponses || {}), [userId]: status },
      occurrenceResponses,
    }
  }
  return {
    ...event,
    occurrenceResponses: {
      ...(event.occurrenceResponses || {}),
      [key]: { ...(event.occurrenceResponses?.[key] ?? {}), [userId]: status },
    },
  }
}

export function summarizeResponses(event: ScheduleEvent, key: string, members: ServerMember[]) {
  const groups: Record<RsvpStatus | 'pending', ServerMember[]> = {
    accepted: [],
    tentative: [],
    declined: [],
    pending: [],
  }
  for (const id of getInviteeIds(event, members)) {
    const member = members.find((m) => m.id === id) ?? { id, name: 'Unknown member', avatar: '' }
    groups[getResponse(event, key, id) ?? 'pending'].push(member)
  }
  return groups
}

export function describeRecurrence(r: ScheduleEventRecurrence | null, start: Date) {
  if (!r) return 'Does not repeat'
  const every = r.interval > 1 ? `Every ${r.interval} ` : 'Every '
  let base = ''
  if (r.freq === 'daily') base = r.interval > 1 ? `${every}days` : 'Daily'
  else if (r.freq === 'weekly') {
    const days = (r.weekdays?.length ? r.weekdays : [start.getDay()]).slice().sort().map((d) => WEEKDAY_SHORT[d]).join(', ')
    base = `${r.interval > 1 ? `${every}weeks` : 'Weekly'} on ${days}`
  } else base = `${r.interval > 1 ? `${every}months` : 'Monthly'} on day ${start.getDate()}`
  if (r.until) base += ` · until ${format(parseISO(r.until), 'MMM d, yyyy')}`
  else if (r.count) base += ` · ${r.count} times`
  return base
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function googleMapsEmbedUrl(address: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
}

export function googleMapsUrl(address: string) {
  const trimmed = (address || '').trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`
}

export function countPendingInvites(list: ScheduleEvent[], userId: string, members: ServerMember[], days = 30) {
  const now = new Date()
  return expandEvents(list, now, addDays(now, days))
    .filter((o) => isAfter(o.end, now) && isInvited(o.event, userId, members) && !getResponse(o.event, o.key, userId)).length
}

// ---------------------------------------------------------------------------
// Reactive Cache Store
// ---------------------------------------------------------------------------

interface GuildScheduleState {
  events: ScheduleEvent[]
  members: ServerMember[]
  channels: ServerChannel[]
  loading: boolean
  error: string | null
}

const scheduleCache = new Map<string, GuildScheduleState>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

const EMPTY_SCHEDULE: GuildScheduleState = { events: [], members: [], channels: [], loading: false, error: null }

export function getCachedSchedule(guildId: string | null | undefined): GuildScheduleState {
  if (!guildId) {
    return EMPTY_SCHEDULE
  }
  return scheduleCache.get(guildId) ?? EMPTY_SCHEDULE
}

export async function fetchSchedule(guildId: string): Promise<void> {
  const prev = scheduleCache.get(guildId)
  scheduleCache.set(guildId, {
    events: prev?.events ?? [],
    members: prev?.members ?? [],
    channels: prev?.channels ?? [],
    loading: true,
    error: null,
  })
  notify()

  try {
    const data = await getSchedule(guildId)
    scheduleCache.set(guildId, {
      events: data.events || [],
      members: data.members || [],
      channels: data.channels || [],
      loading: false,
      error: null,
    })
  } catch (err: any) {
    scheduleCache.set(guildId, {
      events: prev?.events ?? [],
      members: prev?.members ?? [],
      channels: prev?.channels ?? [],
      loading: false,
      error: err?.message || 'Failed to load schedule',
    })
  } finally {
    notify()
  }
}

export function useScheduleStore(guildId: string | null | undefined) {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const state = useSyncExternalStore(
    subscribe,
    () => getCachedSchedule(guildId),
    () => getCachedSchedule(guildId)
  )

  useEffect(() => {
    if (guildId) {
      fetchSchedule(guildId)
    }
  }, [guildId])

  const createEvent = async (data: Partial<ScheduleEvent>) => {
    if (!guildId) return null
    const res = await createScheduleEvent(guildId, data)
    await fetchSchedule(guildId)
    return res.event
  }

  const updateEvent = async (eventId: string, data: Partial<ScheduleEvent>) => {
    if (!guildId) return null
    const res = await updateScheduleEvent(guildId, eventId, data)
    await fetchSchedule(guildId)
    return res.event
  }

  const deleteEvent = async (eventId: string, occurrence?: string) => {
    if (!guildId) return
    await deleteScheduleEvent(guildId, eventId, occurrence)
    await fetchSchedule(guildId)
  }

  const respondToEvent = async (eventId: string, key: string, status: RsvpStatus, scope: RsvpScope) => {
    if (!guildId) return null
    const res = await respondScheduleEvent(guildId, eventId, key, status, scope)
    await fetchSchedule(guildId)
    return res.event
  }

  return {
    ...state,
    refresh: () => (guildId ? fetchSchedule(guildId) : Promise.resolve()),
    createEvent,
    updateEvent,
    deleteEvent,
    respondToEvent,
  }
}
