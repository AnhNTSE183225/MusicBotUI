import { useMemo, useState, type ReactNode } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter as FilterIcon,
  HelpCircle,
  ImageIcon,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Repeat2,
  Trash2,
  Users,
  Volume2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  type EventLocation,
  type Occurrence,
  type Recurrence,
  type RsvpScope,
  type RsvpStatus,
  type ScheduleEvent,
  type ServerMember,
  WEEKDAY_SHORT,
  canManageEvent,
  describeRecurrence,
  expandEvents,
  getResponse,
  googleMapsUrl,
  isInvited,
  summarizeResponses,
  useScheduleStore,
} from '@/lib/schedule'
import {
  CustomSelect,
  CustomDatePicker,
  CustomTimePicker,
  CustomDurationPicker,
  LocationMapPreview,
  SlidingSegmentedControl,
  EVENT_CATEGORIES,
  getCategoryMeta,
  inferCategory,
  type EventCategory,
  type SelectOption,
} from './ScheduleCustomPickers'

type View = 'month' | 'week' | 'agenda'
type Filter = 'all' | 'invited' | 'mine' | 'pending'

const HOUR_PX = 44

const FILTER_OPTIONS: SelectOption<Filter>[] = [
  { value: 'all', label: 'All server events', icon: <FilterIcon size={12} /> },
  { value: 'invited', label: 'Invited to me', icon: <Users size={12} /> },
  { value: 'pending', label: 'Needs my response', icon: <Clock size={12} /> },
  { value: 'mine', label: 'Organized by me', icon: <CalendarDays size={12} /> },
]

export interface ScheduleGuild {
  id: string
  name: string
  channel_name?: string
  icon?: string | null
}

export function ScheduleView({
  guildId,
  guildName,
  userId,
  isAdmin = false,
  guilds = [],
  onSelectGuild,
}: {
  guildId: string | null
  guildName: string
  userId: string
  isAdmin?: boolean
  guilds?: ScheduleGuild[]
  onSelectGuild?: (id: string) => void
}) {
  const {
    events,
    members,
    channels,
    loading,
    error,
    refresh,
    createEvent,
    updateEvent,
    deleteEvent,
    respondToEvent,
  } = useScheduleStore(guildId)

  const [view, setView] = useState<View>('agenda')
  const [filter, setFilter] = useState<Filter>('all')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState<{ id: string; key: string } | null>(null)
  const [editing, setEditing] = useState<{ event?: ScheduleEvent; date?: Date } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [slideDir, setSlideDir] = useState<'right' | 'left'>('right')

  const range = useMemo(() => {
    if (view === 'month') return { from: startOfWeek(startOfMonth(cursor)), to: addDays(endOfWeek(endOfMonth(cursor)), 1) }
    if (view === 'week') return { from: startOfWeek(cursor), to: addDays(endOfWeek(cursor), 1) }
    return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 60) }
  }, [view, cursor])

  const occurrences = useMemo(() => expandEvents(events, range.from, range.to).filter((o) => {
    if (filter === 'mine') return o.event.organizerId === userId
    if (filter === 'invited') return isInvited(o.event, userId, members)
    if (filter === 'pending') return isInvited(o.event, userId, members) && !getResponse(o.event, o.key, userId)
    return true
  }), [events, range, filter, userId, members])

  const selectedOcc = useMemo(() => {
    if (!selected) return null
    const ev = events.find((e) => e.id === selected.id)
    if (!ev) return null
    const d = parseISO(selected.key)
    return expandEvents([ev], d, addDays(d, 1))[0] ?? null
  }, [selected, events])

  const handleRefresh = async () => {
    if (refreshing || loading) return
    setRefreshing(true)
    const startTs = Date.now()
    try {
      await refresh()
      const elapsed = Date.now() - startTs
      if (elapsed < 600) {
        await new Promise((resolve) => setTimeout(resolve, 600 - elapsed))
      }
    } finally {
      setRefreshing(false)
    }
  }

  const step = (dir: 1 | -1) => {
    setSlideDir(dir > 0 ? 'right' : 'left')
    setCursor((c) => (view === 'month' ? addMonths(c, dir) : view === 'week' ? addWeeks(c, dir) : addDays(c, 30 * dir)))
  }

  const goToday = () => {
    const today = startOfDay(new Date())
    setSlideDir(today >= cursor ? 'right' : 'left')
    setCursor(today)
  }

  const handleViewChange = (nextView: View) => {
    if (nextView === view) return
    const order: Record<View, number> = { agenda: 0, month: 1, week: 2 }
    setSlideDir(order[nextView] >= order[view] ? 'right' : 'left')
    setView(nextView)
  }

  const title = useMemo(() => {
    if (view === 'month') return format(cursor, 'MMMM yyyy')
    if (view === 'week') {
      const s = startOfWeek(cursor)
      const e = endOfWeek(cursor)
      return isSameMonth(s, e) ? `${format(s, 'MMM d')} – ${format(e, 'd, yyyy')}` : `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
    }
    return `Upcoming · from ${format(cursor, 'MMM d')}`
  }, [view, cursor])

  const open = (o: Occurrence) => setSelected({ id: o.event.id, key: o.key })

  return (
    <section className="schedule-panel glass-surface" aria-label="Server schedule">
      <div className="schedule-toolbar">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight size={16} />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs font-medium" onClick={goToday}>
            Today
          </Button>
          <h2 className="schedule-title truncate">{title}</h2>
          {(loading || refreshing) && <Loader2 size={14} className="animate-spin text-muted-foreground ml-2" />}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {guilds && guilds.length > 1 && onSelectGuild && (
            <CustomSelect
              value={guildId || ''}
              onChange={onSelectGuild}
              options={guilds.map((g) => ({
                value: g.id,
                label: g.name,
                badge: g.channel_name ? 'in voice' : undefined,
              }))}
              ariaLabel="Switch server calendar"
              className="w-48"
            />
          )}

          <CustomSelect
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS}
            ariaLabel="Filter events"
            className="w-44"
          />

          <SlidingSegmentedControl<View>
            value={view}
            onChange={handleViewChange}
            options={[
              { value: 'agenda', label: 'Agenda' },
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
            ]}
            ariaLabel="Calendar view"
          />

          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            title="Refresh schedule"
          >
            <RefreshCw size={13} className={refreshing || loading ? 'animate-spin' : ''} />
          </Button>

          <Button size="sm" className="text-xs font-semibold shadow-sm" onClick={() => setEditing({ date: cursor })}>
            <Plus size={14} className="mr-1" />New event
          </Button>
        </div>
      </div>

      {error && (
        <div className="schedule-error-banner text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded-md my-2 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleRefresh} disabled={refreshing || loading}>
            Retry
          </Button>
        </div>
      )}

      <div className="schedule-body">
        {!guildId ? (
          <div className="schedule-empty p-8 text-center flex flex-col items-center justify-center gap-3 h-full">
            <CalendarDays size={36} className="text-muted-foreground/60" />
            <h3 className="font-semibold text-base text-foreground">No Server Selected</h3>
            <p className="text-muted-foreground text-xs max-w-sm">
              Please choose a Discord server from the selector above to view and schedule server events.
            </p>
          </div>
        ) : (
          <>
            {view === 'month' && (
              <div key={`month-${format(cursor, 'yyyy-MM')}`} className={`${slideDir === 'right' ? 'schedule-slide-from-right' : 'schedule-slide-from-left'} flex-1 min-h-0 flex flex-col`}>
                <MonthGrid cursor={cursor} occurrences={occurrences} userId={userId} onOpen={open} onDay={(d) => setEditing({ date: d })} />
              </div>
            )}
            {view === 'week' && (
              <div key={`week-${format(cursor, 'yyyy-ww')}`} className={`${slideDir === 'right' ? 'schedule-slide-from-right' : 'schedule-slide-from-left'} flex-1 min-h-0 flex flex-col`}>
                <WeekGrid cursor={cursor} occurrences={occurrences} userId={userId} members={members} onOpen={open} />
              </div>
            )}
            {view === 'agenda' && (
              <div key={`agenda-${format(cursor, 'yyyy-MM-dd')}`} className={`${slideDir === 'right' ? 'schedule-slide-from-right' : 'schedule-slide-from-left'} flex-1 min-h-0 flex flex-col`}>
                <Agenda occurrences={occurrences} userId={userId} members={members} onOpen={open} />
              </div>
            )}
          </>
        )}
      </div>

      {selectedOcc && (
        <EventDetails
          occ={selectedOcc}
          userId={userId}
          isAdmin={isAdmin}
          members={members}
          guildName={guildName}
          guildId={guildId}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing({ event: selectedOcc.event }); setSelected(null) }}
          onDelete={async (whole: boolean) => {
            await deleteEvent(selectedOcc.event.id, whole ? undefined : selectedOcc.key)
            setSelected(null)
          }}
          onRespond={async (status: RsvpStatus, scope: RsvpScope) => {
            await respondToEvent(selectedOcc.event.id, selectedOcc.key, status, scope)
          }}
        />
      )}

      {editing && guildId && (
        <EventEditor
          key={editing.event?.id ?? 'new'}
          guildId={guildId}
          userId={userId}
          members={members}
          channels={channels}
          initial={editing.event}
          date={editing.date}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing.event) {
              await updateEvent(editing.event.id, data)
            } else {
              await createEvent(data)
            }
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: RsvpStatus | null }) {
  const cls = status === 'accepted' ? 'is-accepted' : status === 'declined' ? 'is-declined' : status === 'tentative' ? 'is-tentative' : 'is-pending'
  return <span className={`rsvp-dot ${cls}`} aria-hidden="true" />
}

function CreatorAvatar({
  name,
  avatar,
  id,
  size = 16,
}: {
  name: string
  avatar?: string | null
  id?: string
  size?: number
}) {
  const [imgError, setImgError] = useState(false)
  const avatarUrl = useMemo(() => {
    if (!avatar) return null
    if (/^https?:\/\//i.test(avatar)) return avatar
    if (id) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`
    return null
  }, [avatar, id])

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        className="rounded-full object-cover shrink-0 border border-white/10 inline-block"
        style={{ width: size, height: size }}
      />
    )
  }

  const initial = (name || '?')[0].toUpperCase()
  return (
    <span
      className="rounded-full bg-primary/20 text-primary font-bold inline-flex items-center justify-center shrink-0 text-[9px] uppercase border border-primary/30"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  )
}

function MonthGrid({
  cursor,
  occurrences,
  userId,
  onOpen,
  onDay,
}: {
  cursor: Date
  occurrences: Occurrence[]
  userId: string
  onOpen: (o: Occurrence) => void
  onDay: (d: Date) => void
}) {
  const start = startOfWeek(startOfMonth(cursor))
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  return (
    <div className="month-grid">
      {WEEKDAY_SHORT.map((d) => <div key={d} className="month-head">{d}</div>)}
      {days.map((d) => {
        const list = occurrences.filter((o) => isSameDay(o.start, d))
        return (
          <div
            key={d.toISOString()}
            className={`month-cell ${isSameMonth(d, cursor) ? '' : 'is-outside'}`}
            onClick={() => onDay(d)}
            title="Click to create event on this date"
          >
            <span className={`month-day ${isToday(d) ? 'is-today' : ''}`}>{format(d, 'd')}</span>
            <div className="flex flex-col gap-1 min-w-0">
              {list.slice(0, 3).map((o) => {
                const CatIcon = getCategoryMeta(o.event.category, o.event.title, o.event.description).icon
                return (
                  <button
                    key={o.event.id + o.key}
                    className="month-chip"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen(o)
                    }}
                    title={`${o.event.title} (${format(o.start, 'HH:mm')})`}
                  >
                    <StatusDot status={getResponse(o.event, o.key, userId)} />
                    <CatIcon size={11} className="shrink-0 text-primary/80" />
                    <span className="shrink-0 text-muted-foreground font-mono text-[10px]">{format(o.start, 'HH:mm')}</span>
                    <span className="truncate">{o.event.title}</span>
                  </button>
                )
              })}
              {list.length > 3 && <span className="month-more">+{list.length - 3} more</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function WeekGrid({
  cursor,
  occurrences,
  userId,
  members,
  onOpen,
}: {
  cursor: Date
  occurrences: Occurrence[]
  userId: string
  members: ServerMember[]
  onOpen: (o: Occurrence) => void
}) {
  const start = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="week-wrap">
      <div className="week-head">
        <span />
        {days.map((d) => (
          <span key={d.toISOString()} className={isToday(d) ? 'is-today' : ''}>
            {format(d, 'EEE d')}
          </span>
        ))}
      </div>
      <div className="week-scroll custom-schedule-scrollbar" ref={(el) => { if (el && !el.dataset.init) { el.scrollTop = HOUR_PX * 8; el.dataset.init = '1' } }}>
        <div className="week-grid" style={{ height: HOUR_PX * 24 }}>
          <div className="week-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * HOUR_PX }}>
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((d) => {
            const list = occurrences.filter((o) => isSameDay(o.start, d))
            const lanes: Occurrence[][] = []
            for (const o of list) {
              const lane = lanes.find((l) => l[l.length - 1].end <= o.start)
              if (lane) lane.push(o); else lanes.push([o])
            }
            return (
              <div key={d.toISOString()} className="week-col">
                {lanes.map((lane, li) => lane.map((o) => {
                  const top = (o.start.getHours() + o.start.getMinutes() / 60) * HOUR_PX
                  const mins = Math.min(o.event.durationMinutes, (24 - o.start.getHours()) * 60 - o.start.getMinutes())
                  const CatIcon = getCategoryMeta(o.event.category, o.event.title, o.event.description).icon
                  const organizer = members.find((m) => m.id === o.event.organizerId)
                  return (
                    <button
                      key={o.event.id + o.key}
                      className="week-event"
                      onClick={() => onOpen(o)}
                      style={{ top, height: Math.max(24, (mins / 60) * HOUR_PX - 2), left: `${(li / lanes.length) * 100}%`, width: `${100 / lanes.length}%` }}
                    >
                      <span className="flex items-center gap-1 font-semibold truncate">
                        <StatusDot status={getResponse(o.event, o.key, userId)} />
                        <CatIcon size={12} className="shrink-0 text-primary/80" />
                        <span className="truncate">{o.event.title}</span>
                      </span>
                      <div className="flex items-center justify-between gap-1 text-muted-foreground text-[10px] min-w-0">
                        <span className="font-mono shrink-0">{format(o.start, 'HH:mm')}–{format(o.end, 'HH:mm')}</span>
                        {organizer && (
                          <span className="flex items-center gap-1 min-w-0 shrink truncate">
                            <CreatorAvatar
                              name={organizer.name}
                              avatar={organizer.avatar || o.event.organizerAvatar}
                              id={organizer.id}
                              size={12}
                            />
                            <span className="truncate">{organizer.name}</span>
                          </span>
                        )}
                      </div>
                    </button>
                  )
                }))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LocationLabel({ location }: { location: EventLocation | null }) {
  if (!location) return null
  if (location.kind === 'discord') return <span className="inline-flex items-center gap-1 min-w-0"><Volume2 size={12} className="shrink-0 text-primary" /><span className="truncate">#{location.channelName}</span></span>
  if (location.kind === 'address') return <span className="inline-flex items-center gap-1 min-w-0"><MapPin size={12} className="shrink-0 text-primary" /><span className="truncate">{location.address}</span></span>
  return <span className="inline-flex items-center gap-1 min-w-0"><Link2 size={12} className="shrink-0 text-primary" /><span className="truncate">{location.url?.replace(/^https?:\/\//, '')}</span></span>
}

function Agenda({
  occurrences,
  userId,
  members,
  onOpen,
}: {
  occurrences: Occurrence[]
  userId: string
  members: ServerMember[]
  onOpen: (o: Occurrence) => void
}) {
  if (!occurrences.length) return <div className="schedule-empty"><CalendarDays size={24} /><span>No events in the next 60 days.</span></div>
  const groups: { day: Date; items: Occurrence[] }[] = []
  for (const o of occurrences) {
    const g = groups.find((x) => isSameDay(x.day, o.start))
    if (g) g.items.push(o); else groups.push({ day: startOfDay(o.start), items: [o] })
  }
  return (
    <div className="agenda-list custom-schedule-scrollbar">
      {groups.map((g) => (
        <div key={g.day.toISOString()} className="agenda-day">
          <div className="agenda-date">
            <strong>{format(g.day, 'd')}</strong>
            <span>{isToday(g.day) ? 'Today' : format(g.day, 'EEE, MMM')}</span>
          </div>
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {g.items.map((o) => {
              const status = getResponse(o.event, o.key, userId)
              const organizer = members.find((m) => m.id === o.event.organizerId)
              return (
                <button key={o.event.id + o.key} className="agenda-item" onClick={() => onOpen(o)}>
                  <span className="agenda-time font-mono">
                    {format(o.start, 'HH:mm')}
                    <br />
                    <span className="text-muted-foreground">{format(o.end, 'HH:mm')}</span>
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col gap-1">
                    {(() => {
                      const CatIcon = getCategoryMeta(o.event.category, o.event.title, o.event.description).icon
                      return (
                        <span className="flex items-center gap-1.5 text-sm font-semibold truncate">
                          <CatIcon size={14} className="text-primary/85 shrink-0" />
                          {o.event.title}
                          {o.event.recurrence && <Repeat2 size={13} className="text-muted-foreground shrink-0" />}
                        </span>
                      )
                    })()}
                    <span className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
                      <LocationLabel location={o.event.location} />
                      {organizer && (
                        <span className="shrink-0 flex items-center gap-1.5">
                          <CreatorAvatar
                            name={organizer.name}
                            avatar={organizer.avatar || o.event.organizerAvatar}
                            id={organizer.id}
                            size={16}
                          />
                          <span>by {organizer.name}</span>
                        </span>
                      )}
                    </span>
                  </span>
                  <span className={`rsvp-pill ${status ? `is-${status}` : 'is-pending'}`}>
                    {isInvited(o.event, userId, members) ? (status ? status[0].toUpperCase() + status.slice(1) : 'Respond') : 'Not invited'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function Avatar({ m, size = 22 }: { m: ServerMember; size?: number }) {
  return m.avatar
    ? <img src={m.avatar} alt="" className="rounded-full object-cover inline-block shrink-0 shadow-xs" style={{ width: size, height: size }} />
    : <span className="rounded-full bg-muted inline-grid place-items-center shrink-0 text-[11px] font-semibold" style={{ width: size, height: size }}>{(m.name || 'U')[0]}</span>
}

function EventDetails({
  occ,
  userId,
  isAdmin,
  members,
  guildName,
  guildId,
  onClose,
  onEdit,
  onDelete,
  onRespond,
}: {
  occ: Occurrence
  userId: string
  isAdmin: boolean
  members: ServerMember[]
  guildName: string
  guildId: string | null
  onClose: () => void
  onEdit: () => void
  onDelete: (whole: boolean) => Promise<void>
  onRespond: (status: RsvpStatus, scope: RsvpScope) => Promise<void>
}) {
  const ev = occ.event
  const isOwner = canManageEvent(ev, userId, isAdmin)
  const invited = isInvited(ev, userId, members)
  const myStatus = getResponse(ev, occ.key, userId)
  const [scope, setScope] = useState<RsvpScope>('occurrence')
  const [tab, setTab] = useState<RsvpStatus | 'pending'>('accepted')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const groups = summarizeResponses(ev, occ.key, members)
  const organizer = members.find((m) => m.id === ev.organizerId)

  const handleRespond = async (s: RsvpStatus) => {
    setBusy(true)
    try {
      await onRespond(s, ev.recurrence ? scope : 'series')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (whole: boolean) => {
    setBusy(true)
    try {
      await onDelete(whole)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="schedule-dialog max-w-xl p-0 overflow-hidden flex flex-col max-h-[88vh] rounded-2xl border border-border bg-card shadow-2xl">
        {ev.imageUrl && (
          <div className="relative shrink-0">
            <img src={ev.imageUrl} alt="" className="w-full h-36 object-cover" />
          </div>
        )}

        {/* Fixed Header */}
        <div className="px-6 py-4 border-b border-border/70 shrink-0 bg-card/90 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 flex-wrap">
              {(() => {
                const catMeta = getCategoryMeta(ev.category, ev.title, ev.description)
                const CatIcon = catMeta.icon
                return (
                  <>
                    <CatIcon size={19} className="text-primary shrink-0" />
                    <span className="truncate">{ev.title}</span>
                    <span className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border shrink-0">
                      {catMeta.label}
                    </span>
                  </>
                )
              })()}
            </DialogTitle>
            <DialogDescription className="flex flex-col gap-1 text-xs mt-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock size={13} className="text-primary shrink-0" />
                {format(occ.start, 'EEEE, MMM d, yyyy')} · {format(occ.start, 'HH:mm')}–{format(occ.end, 'HH:mm')}
              </span>
              {ev.recurrence && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Repeat2 size={13} className="text-primary shrink-0" />
                  {describeRecurrence(ev.recurrence, parseISO(ev.start))}
                </span>
              )}
              {organizer && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Avatar m={organizer} size={15} />
                  Organized by {organizer.name}{ev.organizerId === userId && ' (you)'}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-schedule-scrollbar">
          {ev.description && <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{ev.description}</p>}

          {ev.location && (
            <div className="detail-block">
              {ev.location.kind === 'discord' && (
                <div className="flex items-center gap-2 text-sm">
                  <Volume2 size={16} className="text-primary shrink-0" />
                  <span>#{ev.location.channelName} <span className="text-muted-foreground text-xs">in {guildName}</span></span>
                  <a
                    className="ml-auto text-xs text-primary font-medium inline-flex items-center gap-1 hover:underline"
                    href={`https://discord.com/channels/${guildId}/${ev.location.channelId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Discord<ExternalLink size={11} />
                  </a>
                </div>
              )}
              {ev.location.kind === 'address' && ev.location.address && (
                <LocationMapPreview address={ev.location.address} />
              )}
              {ev.location.kind === 'link' && ev.location.url && (
                <a
                  className="flex items-center gap-2 text-sm text-primary font-medium hover:underline"
                  href={ev.location.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Link2 size={15} />
                  <span className="truncate">{ev.location.url}</span>
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          {ev.links && ev.links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ev.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="link-chip">
                  <Link2 size={12} />
                  {l.label || l.url}
                </a>
              ))}
            </div>
          )}

          {invited && (
            <div className="detail-block flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold">Your response{myStatus ? `: ${myStatus}` : ''}</span>
                {ev.recurrence && (
                  <div className="schedule-seg" role="radiogroup" aria-label="Response applies to">
                    <button role="radio" aria-checked={scope === 'occurrence'} className={scope === 'occurrence' ? 'is-active' : ''} onClick={() => setScope('occurrence')}>This event</button>
                    <button role="radio" aria-checked={scope === 'series'} className={scope === 'series' ? 'is-active' : ''} onClick={() => setScope('series')}>All events in series</button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <RsvpButton active={myStatus === 'accepted'} disabled={busy} onClick={() => handleRespond('accepted')} icon={<Check size={14} />} label="Accept" tone="is-accepted" />
                <RsvpButton active={myStatus === 'tentative'} disabled={busy} onClick={() => handleRespond('tentative')} icon={<HelpCircle size={14} />} label="Maybe" tone="is-tentative" />
                <RsvpButton active={myStatus === 'declined'} disabled={busy} onClick={() => handleRespond('declined')} icon={<X size={14} />} label="Decline" tone="is-declined" />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Users size={14} className="text-primary" />
              {ev.inviteEveryone ? `Everyone in ${guildName}` : `${groups.accepted.length + groups.tentative.length + groups.declined.length + groups.pending.length} invited`}
            </div>
            <div className="schedule-seg w-full" role="tablist" aria-label="Responses">
              {([['accepted', 'Accepted'], ['tentative', 'Maybe'], ['declined', 'Declined'], ['pending', 'No response']] as const).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={`flex-1 ${tab === k ? 'is-active' : ''}`} onClick={() => setTab(k)}>
                  {label} · {groups[k].length}
                </button>
              ))}
            </div>
            <ul className="flex flex-col gap-2 min-h-[32px]">
              {groups[tab].length === 0 && <li className="text-xs text-muted-foreground py-1">Nobody here yet.</li>}
              {groups[tab].map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 text-sm">
                  <Avatar m={m} />
                  <span>{m.name}</span>
                  {m.id === ev.organizerId && <span className="text-[11px] text-muted-foreground font-medium">Organizer</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="px-6 py-3.5 border-t border-border/70 shrink-0 bg-card/95 backdrop-blur-md flex items-center justify-between gap-3 flex-wrap">
          {isOwner ? (
            !confirmDelete ? (
              <div className="flex items-center gap-2 w-full justify-between">
                <Button variant="ghost" size="sm" className="text-xs text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  <Trash2 size={13} className="mr-1" />Delete
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={onEdit} disabled={busy}>
                    <Pencil size={13} className="mr-1" />Edit{ev.recurrence ? ' series' : ''}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full justify-between flex-wrap">
                <span className="text-xs font-semibold text-destructive">
                  Delete {ev.recurrence ? 'which events?' : 'this event?'}
                </span>
                <div className="flex items-center gap-2">
                  {ev.recurrence && (
                    <Button variant="outline" size="sm" className="text-xs" disabled={busy} onClick={() => handleRemove(false)}>
                      Only this one
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" className="text-xs" disabled={busy} onClick={() => handleRemove(true)}>
                    {ev.recurrence ? 'Whole series' : 'Confirm delete'}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs" disabled={busy} onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="flex justify-end w-full">
              <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RsvpButton({ active, disabled, onClick, icon, label, tone }: { active: boolean; disabled?: boolean; onClick: () => void; icon: ReactNode; label: string; tone: string }) {
  return <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick} className={`rsvp-btn ${tone} ${active ? 'is-active' : ''}`}>{icon}{label}</button>
}

type LocKind = 'none' | EventLocation['kind']

function EventEditor({
  guildId,
  userId,
  members,
  channels,
  initial,
  date,
  onClose,
  onSave,
}: {
  guildId: string
  userId: string
  members: ServerMember[]
  channels: { id: string; name: string }[]
  initial?: ScheduleEvent
  date?: Date
  onClose: () => void
  onSave: (data: Partial<ScheduleEvent>) => Promise<void>
}) {
  const start0 = initial ? parseISO(initial.start) : (() => { const d = startOfDay(date ?? new Date()); d.setHours(20); return d })()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState<EventCategory>(initial?.category ?? 'other')
  const [manualCategory, setManualCategory] = useState(Boolean(initial?.category && initial.category !== 'other'))
  const [day, setDay] = useState(format(start0, 'yyyy-MM-dd'))
  const [time, setTime] = useState(format(start0, 'HH:mm'))
  const [duration, setDuration] = useState(initial?.durationMinutes ?? 60)
  const [freq, setFreq] = useState<'none' | Recurrence['freq']>(initial?.recurrence?.freq ?? 'none')
  const [interval, setIntervalN] = useState(initial?.recurrence?.interval ?? 1)
  const [weekdays, setWeekdays] = useState<number[]>(initial?.recurrence?.weekdays ?? [start0.getDay()])
  const [ends, setEnds] = useState<'never' | 'until' | 'count'>(initial?.recurrence?.until ? 'until' : initial?.recurrence?.count ? 'count' : 'never')
  const [until, setUntil] = useState(initial?.recurrence?.until ?? format(addMonths(start0, 3), 'yyyy-MM-dd'))
  const [count, setCount] = useState(initial?.recurrence?.count ?? 10)
  const [locKind, setLocKind] = useState<LocKind>(initial?.location?.kind ?? 'discord')
  const [channelId, setChannelId] = useState(initial?.location?.kind === 'discord' ? (initial.location.channelId || '') : channels[0]?.id ?? '')
  const [address, setAddress] = useState(initial?.location?.kind === 'address' ? (initial.location.address || '') : '')
  const [url, setUrl] = useState(initial?.location?.kind === 'link' ? (initial.location.url || '') : '')
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '')
  const [links, setLinks] = useState(initial?.links ?? [])
  const [everyone, setEveryone] = useState(initial?.inviteEveryone ?? true)
  const [invitees, setInvitees] = useState<string[]>(initial?.inviteeIds ?? [])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [locSlideDir, setLocSlideDir] = useState<'right' | 'left'>('right')

  const handleLocKindChange = (next: LocKind) => {
    if (next === locKind) return
    const kinds: LocKind[] = ['discord', 'address', 'link', 'none']
    const prevIdx = kinds.indexOf(locKind)
    const nextIdx = kinds.indexOf(next)
    setLocSlideDir(nextIdx >= prevIdx ? 'right' : 'left')
    setLocKind(next)
  }

  const others = members.filter((m) => m.id !== userId)

  const handleSave = async () => {
    if (!title.trim()) return setError('Give your event a title.')
    if (!everyone && invitees.length === 0) return setError('Invite at least one person, or invite the whole server.')
    if (locKind === 'address' && !address.trim()) return setError('Add an address or Google Maps link.')
    if (locKind === 'link' && !/^https?:\/\//.test(url)) return setError('Online link must start with http:// or https://')

    const ch = channels.find((c) => c.id === channelId)
    const location: EventLocation | null = locKind === 'discord' && ch
      ? { kind: 'discord', channelId: ch.id, channelName: ch.name }
      : locKind === 'address'
      ? { kind: 'address', address: address.trim() }
      : locKind === 'link'
      ? { kind: 'link', url: url.trim() }
      : null

    const recurrence: Recurrence | null = freq === 'none' ? null : {
      freq,
      interval: Math.max(1, interval),
      weekdays: freq === 'weekly' ? (weekdays.length ? weekdays : [parseISO(day).getDay()]) : undefined,
      until: ends === 'until' ? until : null,
      count: ends === 'count' ? Math.max(1, count) : null,
    }

    const data: Partial<ScheduleEvent> = {
      title: title.trim(),
      description,
      category,
      start: `${day}T${time}`,
      durationMinutes: Math.max(15, duration),
      recurrence,
      location,
      imageUrl: imageUrl.trim() || null,
      links: links.filter((l) => l.url.trim()),
      inviteEveryone: everyone,
      inviteeIds: everyone ? [] : invitees,
    }

    setSaving(true)
    setError('')
    try {
      await onSave(data)
    } catch (e: any) {
      setError(e?.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  const FREQ_OPTIONS: SelectOption<typeof freq>[] = [
    { value: 'none', label: 'Does not repeat (one-off)' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
  ]

  const ENDS_OPTIONS: SelectOption<typeof ends>[] = [
    { value: 'never', label: 'Never' },
    { value: 'until', label: 'On specific date' },
    { value: 'count', label: 'After number of events' },
  ]

  const channelOptions: SelectOption<string>[] = channels.length > 0
    ? channels.map((c) => ({ value: c.id, label: `#${c.name}`, icon: <Volume2 size={13} className="text-primary" /> }))
    : [{ value: '', label: 'No voice channels found' }]

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="schedule-dialog max-w-xl p-0 overflow-hidden flex flex-col max-h-[88vh] rounded-2xl border border-border bg-card shadow-2xl">
        {/* Fixed Header */}
        <div className="px-6 py-4 border-b border-border/70 shrink-0 bg-card/90 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <CalendarDays size={18} className="text-primary" />
              {initial ? 'Edit event' : 'New event'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {initial?.recurrence ? 'Changes apply to every event in this series.' : 'Anyone in the server can create events. Only you or admins can edit or delete yours.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-schedule-scrollbar">
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => {
                const val = e.target.value
                setTitle(val)
                if (!manualCategory) {
                  const inferred = inferCategory(val, description)
                  if (inferred !== 'other') {
                    setCategory(inferred)
                  }
                }
              }}
              placeholder="Friday listening party"
            />
          </Field>

          <Field label="Description">
            <textarea className="schedule-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's happening?" />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Date">
              <CustomDatePicker value={day} onChange={setDay} />
            </Field>
            <Field label="Start Time">
              <CustomTimePicker value={time} onChange={setTime} />
            </Field>
            <Field label="Length">
              <CustomDurationPicker value={duration} onChange={setDuration} />
            </Field>
          </div>

          <Field label="Repeat">
            <div className="flex gap-3 flex-wrap items-center">
              <CustomSelect
                value={freq}
                onChange={(val) => setFreq(val)}
                options={FREQ_OPTIONS}
                className="w-56"
              />
              {freq !== 'none' && (
                <span className="flex items-center gap-2 text-xs font-medium">
                  every
                  <Input
                    type="number"
                    min={1}
                    className="w-16 h-8 text-center"
                    value={interval}
                    onChange={(e) => setIntervalN(Math.max(1, Number(e.target.value)))}
                  />
                  {freq === 'daily' ? 'day(s)' : freq === 'weekly' ? 'week(s)' : 'month(s)'}
                </span>
              )}
            </div>
          </Field>

          {freq === 'weekly' && (
            <div className="flex gap-2 flex-wrap">
              {WEEKDAY_SHORT.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={weekdays.includes(i)}
                  className={`day-toggle ${weekdays.includes(i) ? 'is-active' : ''}`}
                  onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          {freq !== 'none' && (
            <Field label="Ends">
              <div className="flex gap-3 flex-wrap items-center">
                <CustomSelect
                  value={ends}
                  onChange={(val) => setEnds(val)}
                  options={ENDS_OPTIONS}
                  className="w-56"
                />
                {ends === 'until' && (
                  <CustomDatePicker value={until} onChange={setUntil} className="w-48" />
                )}
                {ends === 'count' && (
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Input
                      type="number"
                      min={1}
                      className="w-20 h-8 text-center"
                      value={count}
                      onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
                    />
                    <span>events</span>
                  </div>
                )}
              </div>
            </Field>
          )}

          <Field label="Category">
            <SlidingSegmentedControl<EventCategory>
              value={category}
              onChange={(cat) => {
                setManualCategory(true)
                setCategory(cat)
              }}
              options={EVENT_CATEGORIES.map((cat) => ({
                value: cat.id,
                label: cat.label,
                icon: <cat.icon size={13} />,
              }))}
              className="w-full"
              buttonClassName="flex-1 py-1.5 text-xs font-medium"
              ariaLabel="Event category"
            />
          </Field>

          <Field label="Location">
            <SlidingSegmentedControl<LocKind>
              value={locKind}
              onChange={setLocKind}
              options={[
                { value: 'discord', label: 'Voice channel' },
                { value: 'address', label: 'Google Maps / Address' },
                { value: 'link', label: 'Online link' },
                { value: 'none', label: 'None' },
              ]}
              className="w-full mb-3"
              buttonClassName="flex-1 py-1.5 text-xs font-medium"
              ariaLabel="Event location type"
            />
            {locKind === 'discord' && (
              <CustomSelect
                value={channelId}
                onChange={setChannelId}
                options={channelOptions}
                placeholder="Select a voice channel..."
                className="w-full"
                triggerClassName="w-full py-2"
              />
            )}
            {locKind === 'address' && (
              <div className="space-y-3">
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Paste Google Maps link (maps.app.goo.gl) or street address..."
                />
                <LocationMapPreview address={address} />
              </div>
            )}
            {locKind === 'link' && <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://twitch.tv/… or https://meet.google.com/…" />}
          </Field>

          <Field label="Cover image URL">
            <div className="flex items-center gap-2">
              <ImageIcon size={15} className="text-muted-foreground shrink-0" />
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/image.jpg" />
            </div>
            {imageUrl && <img src={imageUrl} alt="" className="mt-2 w-full h-28 object-cover rounded-xl border border-border shadow-xs" />}
          </Field>

          <Field label="Additional Links">
            <div className="flex flex-col gap-2.5">
              {links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input className="w-1/3" value={l.label} placeholder="Label" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <Input value={l.url} placeholder="https://" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                  <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => setLinks(links.filter((_, j) => j !== i))}><X size={14} /></Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="self-start text-xs font-medium" onClick={() => setLinks([...links, { label: '', url: '' }])}><Plus size={13} className="mr-1" />Add link</Button>
            </div>
          </Field>

          <Field label="Invite Audience">
            <label className="flex items-center gap-2 text-sm mb-2.5 cursor-pointer font-medium">
              <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} className="accent-[var(--primary)] h-4 w-4 rounded" />
              Everyone in this server
            </label>
            {!everyone && (
              <div className="flex flex-wrap gap-2">
                {others.length === 0 && <span className="text-xs text-muted-foreground">No other server members loaded.</span>}
                {others.map((m) => {
                  const on = invitees.includes(m.id)
                  return (
                    <button key={m.id} type="button" aria-pressed={on} className={`invitee-chip ${on ? 'is-active' : ''}`}
                      onClick={() => setInvitees((list) => (on ? list.filter((x) => x !== m.id) : [...list, m.id]))}>
                      <Avatar m={m} size={18} />{m.name}{on && <Check size={12} />}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>
        </div>

        {/* Fixed Footer */}
        <div className="px-6 py-4 border-t border-border/70 shrink-0 bg-card/95 backdrop-blur-md flex items-center justify-between gap-3">
          {error ? <p className="text-xs text-destructive font-medium truncate max-w-xs">{error}</p> : <span className="text-xs text-muted-foreground">Fill in details and save</span>}
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="min-w-28 font-medium">
              {saving ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
              {initial ? 'Save changes' : 'Create event'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      {children}
    </div>
  )
}
