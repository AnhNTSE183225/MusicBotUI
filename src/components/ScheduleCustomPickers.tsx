import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, type ReactNode } from 'react'
import {
  format,
  parseISO,
  isValid,
  startOfWeek,
  startOfMonth,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
} from 'date-fns'
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Check,
  MapPin,
  ExternalLink,
  Plus,
  Minus,
  Gamepad2,
  Utensils,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

// ---------------------------------------------------------------------------
// Category Definitions & Helper
// ---------------------------------------------------------------------------

export type EventCategory = 'gaming' | 'food' | 'outdoor' | 'other'

export const EVENT_CATEGORIES: { id: EventCategory; label: string; icon: typeof Gamepad2 }[] = [
  { id: 'gaming', label: 'Gaming', icon: Gamepad2 },
  { id: 'food', label: 'Food-related', icon: Utensils },
  { id: 'outdoor', label: 'Outside / POI', icon: MapPin },
  { id: 'other', label: 'Other', icon: CalendarIcon },
]

export function inferCategory(title?: string, description?: string): EventCategory {
  const text = `${title || ''} ${description || ''}`.toLowerCase()
  if (/\b(game|gaming|play|match|stream|lan|esport|rpg|mmo|fps|valorant|lol|dota|csgo|cs2|minecraft|roblox|genshin|discord|raid)\b/.test(text)) {
    return 'gaming'
  }
  if (/\b(food|eat|lunch|dinner|breakfast|brunch|meal|pizza|burger|coffee|cafe|bar|bbq|cook|drink|restaurant|boba|snack)\b/.test(text)) {
    return 'food'
  }
  if (/\b(outdoor|park|walk|trip|hike|hiking|camp|camping|outside|beach|travel|tour|meetup|venue|location|poi)\b/.test(text)) {
    return 'outdoor'
  }
  return 'other'
}

export function getCategoryMeta(cat?: string, title?: string, description?: string) {
  let matched = EVENT_CATEGORIES.find((c) => c.id === cat)
  if ((!matched || matched.id === 'other') && (title || description)) {
    const inferred = inferCategory(title, description)
    if (inferred !== 'other') {
      matched = EVENT_CATEGORIES.find((c) => c.id === inferred)
    }
  }
  return matched || EVENT_CATEGORIES[3]
}

// ---------------------------------------------------------------------------
// Sliding Segmented Control with Gliding Highlight Pill
// ---------------------------------------------------------------------------

export interface SegmentOption<T extends string = string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  badge?: ReactNode
}

export function SlidingSegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  className = '',
  buttonClassName = '',
  ariaLabel,
}: {
  value: T
  onChange: (val: T) => void
  options: SegmentOption<T>[]
  className?: string
  buttonClassName?: string
  ariaLabel?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  })

  const update = useCallback(() => {
    if (!containerRef.current) return
    const active = containerRef.current.querySelector<HTMLButtonElement>(`button[data-value="${value}"]`)
    if (active) {
      setIndicator({
        left: active.offsetLeft,
        width: active.offsetWidth,
        ready: true,
      })
    }
  }, [value])

  useLayoutEffect(() => {
    update()
  }, [update, options])

  useEffect(() => {
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  return (
    <div
      ref={containerRef}
      className={`schedule-seg ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      <div
        className="schedule-seg-indicator"
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: `${indicator.width}px`,
          opacity: indicator.ready ? 1 : 0,
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          data-value={opt.value}
          aria-selected={value === opt.value}
          className={`relative z-10 flex items-center justify-center gap-1.5 ${buttonClassName} ${value === opt.value ? 'is-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
          <span>{opt.label}</span>
          {opt.badge}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1. Custom Select Dropdown
// ---------------------------------------------------------------------------

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  icon?: ReactNode
  badge?: string
}

export function CustomSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  className = '',
  triggerClassName = '',
  ariaLabel,
}: {
  value: T
  onChange: (val: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  className?: string
  triggerClassName?: string
  ariaLabel?: string
}) {
  const selected = options.find((o) => o.value === value)

  return (
    <div className={`relative inline-block ${className}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel || placeholder}
            className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-border bg-card/60 hover:bg-accent/50 text-foreground text-xs font-medium transition-all duration-200 outline-none focus-visible:ring-1 focus-visible:ring-primary ${triggerClassName}`}
          >
            <span className="flex items-center gap-2 truncate">
              {selected?.icon && <span className="shrink-0 text-muted-foreground">{selected.icon}</span>}
              <span className="truncate">{selected ? selected.label : placeholder}</span>
            </span>
            <ChevronDown size={14} className="text-muted-foreground shrink-0 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="z-50 min-w-[180px] max-h-64 overflow-y-auto p-1.5 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-xl custom-schedule-scrollbar"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors duration-150 ${
                  isSelected
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {opt.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && <Check size={13} className="text-primary" />}
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. Custom Date Picker Popover (Independent of Browser/OS Locale)
// ---------------------------------------------------------------------------

export function CustomDatePicker({
  value,
  onChange,
  className = '',
}: {
  value: string // canonical yyyy-MM-dd
  onChange: (val: string) => void
  className?: string
}) {
  const parsed = useMemo(() => {
    try {
      const d = parseISO(value)
      return isValid(d) ? d : new Date()
    } catch {
      return new Date()
    }
  }, [value])

  const [viewDate, setViewDate] = useState<Date>(parsed)
  const [open, setOpen] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setViewDate(parsed)
    setOpen(nextOpen)
  }

  const start = startOfWeek(startOfMonth(viewDate))
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const weekShort = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const handleSelect = (day: Date) => {
    onChange(format(day, 'yyyy-MM-dd'))
    setOpen(false)
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-full h-9 flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border border-border bg-card/60 hover:bg-accent/50 text-foreground text-xs font-medium transition-all duration-200 outline-none focus-visible:ring-1 focus-visible:ring-primary shadow-xs"
          >
            <span className="flex items-center gap-2 truncate">
              <CalendarIcon size={14} className="text-primary shrink-0" />
              <span className="truncate">{format(parsed, 'EEE, MMM d, yyyy')}</span>
            </span>
            <ChevronDown size={13} className="text-muted-foreground shrink-0 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="z-50 w-72 p-3 rounded-2xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150"
        >
          {/* Header Month / Year & Prev / Next */}
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="font-semibold text-xs tracking-tight text-foreground pl-1">
              {format(viewDate, 'MMMM yyyy')}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setViewDate((d) => subMonths(d, 1))
                }}
                className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                title="Previous month"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setViewDate((d) => addMonths(d, 1))
                }}
                className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                title="Next month"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {weekShort.map((w) => (
              <span key={w} className="text-[10px] font-semibold text-muted-foreground py-0.5">
                {w}
              </span>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {days.map((d) => {
              const inMonth = isSameMonth(d, viewDate)
              const selected = isSameDay(d, parsed)
              const today = isToday(d)

              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => handleSelect(d)}
                  className={`h-7 w-7 mx-auto rounded-md text-xs font-medium flex items-center justify-center transition-all duration-150 relative cursor-pointer ${
                    selected
                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                      : inMonth
                      ? 'text-foreground hover:bg-accent hover:scale-105 active:scale-95'
                      : 'text-muted-foreground/35 hover:bg-accent/40'
                  } ${today && !selected ? 'ring-1 ring-primary/60 font-semibold' : ''}`}
                >
                  {format(d, 'd')}
                </button>
              )
            })}
          </div>

          {/* Quick presets footer */}
          <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => handleSelect(new Date())}
              className="text-primary hover:underline font-medium cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleSelect(addDays(new Date(), 1))}
              className="text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => handleSelect(addDays(new Date(), 7))}
              className="text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
            >
              +1 Week
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. Custom Time Picker Popover (Only Hour and Minute with Scroll/Arrow controls)
// ---------------------------------------------------------------------------

export function CustomTimePicker({
  value,
  onChange,
  className = '',
}: {
  value: string // canonical HH:mm
  onChange: (val: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)

  const [hoursStr, minsStr] = (value || '20:00').split(':')
  const currentH = parseInt(hoursStr || '20', 10)
  const currentM = parseInt(minsStr || '00', 10)

  // 12-hour formatted friendly label (e.g. "20:00 (8:00 PM)")
  const friendlyLabel = useMemo(() => {
    const period = currentH >= 12 ? 'PM' : 'AM'
    const h12 = currentH % 12 || 12
    return `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')} (${h12}:${String(currentM).padStart(2, '0')} ${period})`
  }, [currentH, currentM])

  const setHour = (h: number) => {
    onChange(`${String(h).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`)
  }

  const setMin = (m: number) => {
    onChange(`${String(currentH).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-full h-9 flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border border-border bg-card/60 hover:bg-accent/50 text-foreground text-xs font-medium transition-all duration-200 outline-none focus-visible:ring-1 focus-visible:ring-primary shadow-xs"
          >
            <span className="flex items-center gap-2 truncate">
              <Clock size={14} className="text-primary shrink-0" />
              <span className="truncate">{friendlyLabel}</span>
            </span>
            <ChevronDown size={13} className="text-muted-foreground shrink-0 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="z-50 w-52 p-4 rounded-2xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Set Time
            </span>
            <span className="text-[11px] font-semibold text-primary">
              {(currentH % 12 || 12)}:{String(currentM).padStart(2, '0')} {currentH >= 12 ? 'PM' : 'AM'}
            </span>
          </div>

          {/* Hour & Minute Scroll / Arrow Selectors */}
          <div className="flex items-center justify-center gap-4 py-1">
            {/* Hour Column */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Hour</span>
              <button
                type="button"
                onClick={() => setHour((currentH + 1) % 24)}
                className="h-8 w-12 rounded-lg bg-card/70 hover:bg-accent border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer hover:border-primary/50"
                title="Next hour"
              >
                <ChevronUp size={16} />
              </button>
              <div
                onWheel={(e) => {
                  e.preventDefault()
                  setHour(e.deltaY < 0 ? (currentH + 1) % 24 : (currentH - 1 + 24) % 24)
                }}
                className="my-1.5 w-12 h-11 flex items-center justify-center text-xl font-bold font-mono text-foreground bg-muted/40 rounded-lg border border-border select-none"
                title="Scroll with mouse wheel"
              >
                {String(currentH).padStart(2, '0')}
              </div>
              <button
                type="button"
                onClick={() => setHour((currentH - 1 + 24) % 24)}
                className="h-8 w-12 rounded-lg bg-card/70 hover:bg-accent border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer hover:border-primary/50"
                title="Previous hour"
              >
                <ChevronDown size={16} />
              </button>
            </div>

            {/* Separator */}
            <span className="text-xl font-bold text-muted-foreground pt-4 select-none">:</span>

            {/* Minute Column */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Min</span>
              <button
                type="button"
                onClick={() => setMin((currentM + 5) % 60)}
                className="h-8 w-12 rounded-lg bg-card/70 hover:bg-accent border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer hover:border-primary/50"
                title="Add 5 minutes"
              >
                <ChevronUp size={16} />
              </button>
              <div
                onWheel={(e) => {
                  e.preventDefault()
                  setMin(e.deltaY < 0 ? (currentM + 5) % 60 : (currentM - 5 + 60) % 60)
                }}
                className="my-1.5 w-12 h-11 flex items-center justify-center text-xl font-bold font-mono text-foreground bg-muted/40 rounded-lg border border-border select-none"
                title="Scroll with mouse wheel"
              >
                {String(currentM).padStart(2, '0')}
              </div>
              <button
                type="button"
                onClick={() => setMin((currentM - 5 + 60) % 60)}
                className="h-8 w-12 rounded-lg bg-card/70 hover:bg-accent border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer hover:border-primary/50"
                title="Subtract 5 minutes"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-border/60 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4. Custom Duration / Length Picker (Compact single-line to avoid UI gap)
// ---------------------------------------------------------------------------

const DURATION_PRESETS = [
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '1h', value: 60 },
  { label: '1.5h', value: 90 },
  { label: '2h', value: 120 },
  { label: '3h', value: 180 },
]

export function CustomDurationPicker({
  value,
  onChange,
  className = '',
}: {
  value: number // duration in minutes
  onChange: (val: number) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)

  const formatDurationText = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h} hr${h > 1 ? 's' : ''}`
    return `${m} mins`
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-full h-9 flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border border-border bg-card/60 hover:bg-accent/50 text-foreground text-xs font-medium transition-all duration-200 outline-none focus-visible:ring-1 focus-visible:ring-primary shadow-xs"
          >
            <span className="flex items-center gap-2 truncate">
              <Clock size={14} className="text-primary shrink-0" />
              <span className="truncate">{formatDurationText(value)}</span>
            </span>
            <ChevronDown size={13} className="text-muted-foreground shrink-0 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="z-50 w-56 p-3 rounded-2xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
              Length
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChange(Math.max(15, value - 15))}
                className="h-7 w-7 rounded-md bg-muted/60 hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                title="-15m"
              >
                <Minus size={12} />
              </button>
              <span className="text-xs font-bold text-foreground px-2 py-0.5 bg-card rounded-md border border-border">
                {formatDurationText(value)}
              </span>
              <button
                type="button"
                onClick={() => onChange(Math.min(720, value + 15))}
                className="h-7 w-7 rounded-md bg-muted/60 hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                title="+15m"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {DURATION_PRESETS.map((p) => {
              const isSelected = value === p.value
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    onChange(p.value)
                    setOpen(false)
                  }}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'bg-muted/40 hover:bg-accent text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 5. Rich Location Map Preview (Handles Maps Shortlinks vs Street Addresses)
// ---------------------------------------------------------------------------

export function isGoogleMapsShortlink(val: string): boolean {
  if (!val) return false
  const trimmed = val.trim()
  return (
    /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps)/i.test(trimmed) ||
    /^https?:\/\/waze\.com/i.test(trimmed)
  )
}

export function googleMapsEmbedUrl(q: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=&z=14&ie=UTF8&iwloc=&output=embed`
}

export function LocationMapPreview({
  address,
  className = '',
}: {
  address: string
  className?: string
}) {
  const trimmed = address.trim()
  if (!trimmed) return null

  const isLink = isGoogleMapsShortlink(trimmed)

  if (isLink) {
    return (
      <div
        className={`p-4 rounded-xl border border-primary/20 bg-linear-to-br from-primary/10 via-card/70 to-card flex flex-col gap-3 shadow-md ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <MapPin size={16} />
            </span>
            <div>
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                Google Maps Location
              </div>
              <div className="text-[11px] text-muted-foreground truncate max-w-xs">{trimmed}</div>
            </div>
          </div>
          <a
            href={trimmed}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0 shadow-sm"
          >
            Open in Google Maps
            <ExternalLink size={12} />
          </a>
        </div>
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
          Google Maps shared link detected. Clicking the button above opens the exact pin and directions in your Google Maps app or browser.
        </p>
      </div>
    )
  }

  // Regular address
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5 truncate">
          <MapPin size={13} className="text-primary shrink-0" />
          <span className="truncate">{trimmed}</span>
        </span>
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(trimmed)}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1 text-[11px] shrink-0 font-medium ml-2"
        >
          View Full Map <ExternalLink size={11} />
        </a>
      </div>
      <iframe
        title="Event location map"
        src={googleMapsEmbedUrl(trimmed)}
        className="w-full h-44 rounded-xl border border-border/80 shadow-inner bg-card"
        loading="lazy"
      />
    </div>
  )
}
