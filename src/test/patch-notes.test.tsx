import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import * as api from '@/lib/api'
import {
  PATCH_NOTES,
  CURRENT_VERSION,
  LATEST_PATCH,
  READ_PATCH_STORAGE_KEY,
  getReadVersions,
  markAllVersionsRead,
  markAllVersionsUnread,
  markVersionRead,
  markVersionUnread,
} from '@/data/patchNotes'
import { PatchNotesModal } from '@/components/PatchNotesModal'
import { Route } from '@/routes/index'

class MockEventSource {
  static instances: MockEventSource[] = []
  onmessage: ((event: any) => void) | null = null
  onerror: (() => void) | null = null
  url: string

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  emit(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) })
    }
  }

  close() {}
}

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    checkAuth: vi.fn(),
    getGuilds: vi.fn(),
    getStreamUrl: vi.fn().mockResolvedValue('http://localhost:8000/api/stream/guild1'),
    getLyrics: vi.fn().mockResolvedValue({ lyrics: null }),
    getAIAutoQueue: vi.fn().mockResolvedValue({ enabled: false, prompt: '', count: 5, threshold: 2 }),
    setAIAutoQueue: vi.fn().mockResolvedValue({ status: 'ok' }),
  }
})

describe('Patch Notes & Versioning System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    MockEventSource.instances = []
    // @ts-expect-error Mocking global EventSource
    globalThis.EventSource = MockEventSource

    vi.mocked(api.checkAuth).mockResolvedValue({ id: '12345', username: 'TestUser', avatar: null })
    vi.mocked(api.getAIAutoQueue).mockResolvedValue({ enabled: false, prompt: '', count: 5, threshold: 2 })
    vi.mocked(api.getGuilds).mockResolvedValue({
      guilds: [
        {
          id: 'guild1',
          name: 'Music Server',
          channel_id: 'vc1',
          channel_name: 'listening-room',
          bot_connected: true,
        },
      ],
    })
  })

  it('exposes accurate versioning metadata in patchNotes.ts', () => {
    expect(CURRENT_VERSION).toBe('1.3.0')
    expect(LATEST_PATCH.version).toBe('1.3.0')
    expect(LATEST_PATCH.headline).toBe('Release Notifications & Sleek Sync Badges')
    expect(PATCH_NOTES.length).toBeGreaterThanOrEqual(4)
  })

  it('renders PatchNotesModal with all historical versions and feature bullets', () => {
    const onOpenChange = vi.fn()
    render(<PatchNotesModal open={true} onOpenChange={onOpenChange} />)

    expect(screen.getByRole('heading', { name: /Release Notes/i })).toBeInTheDocument()
    expect(screen.getByText(`v${CURRENT_VERSION} Latest`)).toBeInTheDocument()
    expect(screen.getByText('Click-to-Sync Lyrics')).toBeInTheDocument()
    expect(screen.getByText('Playlist Range Import')).toBeInTheDocument()
    expect(screen.getByText('Initial Release')).toBeInTheDocument()

    // Verify close button
    const closeBtn = screen.getAllByRole('button', { name: /Close/i })[0]
    fireEvent.click(closeBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('displays outside notification counter on pill and toggles read/unread with localStorage', async () => {
    const Component = Route.options.component!
    render(<Component />)

    // Verify header pill is rendered with unread notification badge initially
    const patchPill = await screen.findByRole('button', { name: /release notes/i })
    expect(patchPill).toBeInTheDocument()
    expect(screen.getByText(`v${CURRENT_VERSION}`)).toBeInTheDocument()

    // Initially unread count is equal to all patch notes
    const unreadBadge = screen.getByLabelText(`${PATCH_NOTES.length} unread updates`)
    expect(unreadBadge).toBeInTheDocument()
    expect(unreadBadge).toHaveTextContent(String(PATCH_NOTES.length))

    // Click pill to open Release Notes modal
    fireEvent.click(patchPill)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Release Notes/i })).toBeInTheDocument()
    })

    // Click "Mark all as read"
    const markAllReadBtn = screen.getByRole('button', { name: /Mark all as read/i })
    expect(markAllReadBtn).toBeEnabled()
    fireEvent.click(markAllReadBtn)

    // Stored in localStorage
    expect(JSON.parse(localStorage.getItem(READ_PATCH_STORAGE_KEY) || '[]')).toHaveLength(PATCH_NOTES.length)

    // Outside badge is now gone (unreadCount is 0)
    await waitFor(() => {
      expect(screen.queryByLabelText(/unread updates/i)).not.toBeInTheDocument()
      expect(screen.getByText('All updates read')).toBeInTheDocument()
    })

    // Find "Mark as unread" button for latest version (v1.3.0) and click it
    const markUnreadBtn = screen.getByRole('button', { name: `Mark v${CURRENT_VERSION} as unread` })
    fireEvent.click(markUnreadBtn)

    // Stored in localStorage has 1 less
    const readAfterOneUnread = JSON.parse(localStorage.getItem(READ_PATCH_STORAGE_KEY) || '[]')
    expect(readAfterOneUnread).not.toContain(CURRENT_VERSION)
    expect(readAfterOneUnread).toHaveLength(PATCH_NOTES.length - 1)

    // Outside badge now displays 1 unread update
    await waitFor(() => {
      const badgeAfterUnread = screen.getByLabelText('1 unread updates')
      expect(badgeAfterUnread).toHaveTextContent('1')
    })

    // Click "Mark all as unread"
    const markAllUnreadBtn = screen.getByRole('button', { name: /Mark all as unread/i })
    fireEvent.click(markAllUnreadBtn)

    // LocalStorage cleared
    expect(JSON.parse(localStorage.getItem(READ_PATCH_STORAGE_KEY) || '[]')).toHaveLength(0)

    // Outside badge restored to all unread
    await waitFor(() => {
      const allUnreadBadge = screen.getByLabelText(`${PATCH_NOTES.length} unread updates`)
      expect(allUnreadBadge).toHaveTextContent(String(PATCH_NOTES.length))
    })
  })
})
