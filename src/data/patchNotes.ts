import { useState, useEffect } from 'react';

export interface PatchNote {
  version: string;
  date: string;
  headline: string;
  summary: string;
  details: string[];
}

export const READ_PATCH_STORAGE_KEY = 'musicbot_read_patch_versions';

export const PATCH_NOTES: PatchNote[] = [
  {
    version: '1.5.1',
    date: '2026-10-24',
    headline: 'Event Deep-Link Polish & Dismissal Fix',
    summary: 'Fixes an issue where landing on the web schedule via Discord invitation links trapped users in an unbreakable modal loop.',
    details: [
      'Fixed an auto-open loop that prevented dismissing or closing the event details dialog when arriving from Discord invite links',
      'Seamlessly removes the ?event parameter from the URL upon closing without full page reload',
      'Automatically positions the calendar cursor on the scheduled event date when opening deep links',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-24',
    headline: 'Discord Event Invitations & Direct RSVP Links',
    summary: 'Instantly notifies server members when new events are created—announcing in the dedicated #event channel or messaging invitees directly via DMs with one-click web RSVP.',
    details: [
      'Automatic server invitation broadcasts to the dedicated #event text channel (configurable in config.yaml) without @everyone pings',
      'Personal direct messages (DMs) from the bot when individual members are invited to private sessions',
      'Event invite message starts with organizer mention (<@user> invited you to an event: **Title**)',
      'One-click RSVP web links embedded in invitation cards that take members directly to the event modal on MusicBỏtúi',
      'Configurable event_channel setting with graceful fallback to general and system channels',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-10-24',
    headline: 'Voice Channel Auto-Switch & Responsive Header Polish',
    summary: 'Seamlessly auto-switches active server when joining voice channels and optimizes topbar layout for smaller screens.',
    details: [
      'Smart voice detection: automatically focuses the server where you joined voice chat upon opening or returning to the Listening Room, avoiding false disconnected prompts',
      'Responsive header refinement: resolved element collisions on narrower screen widths with fluid server selector constraints and compact badge styling',
      'Streamlined single-line "Live" session indicator to prevent badge text wrapping across multiple lines',
      'Exact ISO 8601 UTC timestamp persistence for multi-stage event reminders (15-minute lead alert & exact start alert)',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-24',
    headline: 'Server Schedule & Event Calendar',
    summary: 'Plan listening parties, study sessions, and server events directly in your Discord community with Month, Week, and Agenda views.',
    details: [
      'Dedicated Server Calendar tab with Month, Week, and Agenda views',
      'One-off and recurring event scheduling (daily, weekly with weekday selection, monthly)',
      'Multiple location types: Discord voice channels, Google Maps locations/links, and online event links',
      'Server-wide or individual member invitations with real-time RSVP responses (Accept, Maybe, Decline)',
      'Event management and editing permissions for event organizers and server administrators',
      'Multi-server selector to schedule and view events across all your shared Discord servers without requiring an active voice session',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-24',
    headline: 'Release Notifications & Sleek Sync Badges',
    summary: 'Release notes now feature unread notification counters with mark as read/unread controls, plus streamlined in-line lyrics sync indicators.',
    details: [
      'Outside notification counter badge on the release notes button showing live count of unread updates',
      'Persistent local storage tracking for read and unread release notes',
      'Individual "Mark as read" and "Mark as unread" buttons on every version card',
      'Header actions to "Mark all as read" and "Mark all as unread" in a single click',
      'Replaced default browser hover tooltips with modern, in-situ sync playhead badges on lyric lines',
      'Display true net sync offset with clear manual and MV intro breakdown (e.g. -0.4s [Manual: +17.4s, MV intro: 17.8s])',
      'Refined spacing and alignment for sync offset metadata and intro delay chips',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-24',
    headline: 'Click-to-Sync Lyrics',
    summary: 'Manually scroll and click any line to instantly synchronize lyrics to that moment, with delay offset applied.',
    details: [
      'Click any line in line-based or syllable-based lyrics to snap the sync offset to that line in real time',
      'Smooth manual scrolling that temporarily suspends auto-scroll so you can easily browse and pick lines',
      'Keyboard accessibility: press Enter or Space on any lyric line to sync',
      'Persistent per-track offset saved to local storage with one-click Reset to original sync timings',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-24',
    headline: 'Playlist Range Import',
    summary: 'Preview YouTube playlists and customize which songs (from song # to song #) get added to the queue.',
    details: [
      'New subtle playlist button in the queue search bar for instant imports',
      'Automatic frontend playlist URL detection in search input to eliminate unnecessary server load',
      'Interactive preview modal displaying total track count, artwork, titles, and durations',
      'Precise range selection controls (From / To inputs) with one-click presets (All, First 10, 25, 50)',
      'Visual indicators showing included and excluded tracks with single-batch queue addition',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-21',
    headline: 'Initial Release',
    summary: 'Your Discord listening room with real-time synchronized lyrics, shared queue, and AI vibe queueing.',
    details: [
      'Artwork-first listening room with dynamic ambient lighting',
      'Real-time synchronized lyrics (line & syllable sync) with LRCLIB & Musixmatch fallback',
      'Collaborative shared queue with vote skipping, pausing, and reordering',
      'AI Auto-Queue powered by Gemini with custom vibe prompts and community key sharing',
    ],
  },
];

export const CURRENT_VERSION = PATCH_NOTES[0].version;
export const LATEST_PATCH = PATCH_NOTES[0];

export function getReadVersions(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(READ_PATCH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setReadVersions(versions: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(READ_PATCH_STORAGE_KEY, JSON.stringify(versions));
    window.dispatchEvent(new CustomEvent('patch-notes-updated'));
  } catch {}
}

export function markVersionRead(version: string) {
  const current = getReadVersions();
  if (!current.includes(version)) {
    setReadVersions([...current, version]);
  }
}

export function markVersionUnread(version: string) {
  const current = getReadVersions();
  setReadVersions(current.filter((v) => v !== version));
}

export function markAllVersionsRead(allVersions: string[] = PATCH_NOTES.map((p) => p.version)) {
  setReadVersions(Array.from(new Set(allVersions)));
}

export function markAllVersionsUnread() {
  setReadVersions([]);
}

export function getUnreadCount(allVersions: string[] = PATCH_NOTES.map((p) => p.version)): number {
  const read = getReadVersions();
  return allVersions.filter((v) => !read.includes(v)).length;
}

export function usePatchNotesReadState() {
  const [readVersions, setReadVersionsState] = useState<string[]>(() => getReadVersions());

  useEffect(() => {
    setReadVersionsState(getReadVersions());
    const update = () => {
      setReadVersionsState(getReadVersions());
    };
    window.addEventListener('patch-notes-updated', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('patch-notes-updated', update);
      window.removeEventListener('storage', update);
    };
  }, []);

  const unreadCount = PATCH_NOTES.filter((p) => !readVersions.includes(p.version)).length;

  return {
    readVersions,
    unreadCount,
    isRead: (version: string) => readVersions.includes(version),
    markAsRead: markVersionRead,
    markAsUnread: markVersionUnread,
    markAllAsRead: () => markAllVersionsRead(),
    markAllAsUnread: markAllVersionsUnread,
  };
}
