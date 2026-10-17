import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import * as api from '@/lib/api'
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
    getLyrics: vi.fn(),
    getAIAutoQueue: vi.fn().mockResolvedValue({ enabled: false }),
  }
})

describe('Lyrics UI & Issue Fixes (Tickets #2, #3, #4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockEventSource.instances = []
    // @ts-expect-error Mocking global EventSource
    globalThis.EventSource = MockEventSource

    vi.mocked(api.checkAuth).mockResolvedValue({ id: '12345', username: 'TestUser', avatar: null })
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

  it('renders prominent lyrics and queue tabs with icons and badges (Issue #3)', async () => {
    vi.mocked(api.getLyrics).mockResolvedValue({ lyrics: null })
    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live Session')).toBeInTheDocument()
    })

    // Segmented tabs should be prominent
    const queueTab = screen.getByRole('button', { name: /^Queue\b/i })
    const lyricsTab = screen.getByRole('button', { name: /^Lyrics/i })
    expect(queueTab).toBeInTheDocument()
    expect(lyricsTab).toBeInTheDocument()

    // Player controls should have dedicated View lyrics button
    const viewLyricsControl = screen.getByRole('button', { name: /View lyrics/i })
    expect(viewLyricsControl).toBeInTheDocument()

    // Switching tab via player button updates heading to Lyrics
    fireEvent.click(viewLyricsControl)
    expect(screen.getByRole('heading', { level: 2, name: 'Lyrics' })).toBeInTheDocument()
  })

  it('provides Check again retry button when lyrics are not found (Issue #2)', async () => {
    vi.mocked(api.getLyrics).mockResolvedValue({ lyrics: null })
    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live Session')).toBeInTheDocument()
      expect(MockEventSource.instances.length).toBeGreaterThan(0)
    })

    // Simulate currently playing song
    act(() => {
      MockEventSource.instances[0].emit({
        current: { title: 'Song With Lyrics Later', artist: 'Artist', duration: 200 },
        queue: [],
      })
    })

    // Navigate to lyrics tab
    const lyricsTab = screen.getByRole('button', { name: /^Lyrics/i })
    act(() => {
      fireEvent.click(lyricsTab)
    })

    // Should display No lyrics found empty state with "Check again" button
    await waitFor(() => {
      expect(screen.getByText('No lyrics found')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Check again/i })).toBeInTheDocument()
    })

    // Clicking "Check again" triggers getLyrics
    const initialCallCount = vi.mocked(api.getLyrics).mock.calls.length
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Check again/i }))
    })
    expect(vi.mocked(api.getLyrics).mock.calls.length).toBeGreaterThan(initialCallCount)
  })

  it('scrolls container without calling element scrollIntoView (Issue #4)', async () => {
    const mockLyrics = {
      type: 'line' as const,
      provider: 'lrclib',
      lines: [
        { begin: 0, end: 5, text: 'First line of lyrics' },
        { begin: 5, end: 10, text: 'Second line of lyrics' },
      ],
    }
    vi.mocked(api.getLyrics).mockResolvedValue({ lyrics: mockLyrics })

    const scrollIntoViewSpy = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy

    const scrollToSpy = vi.fn()
    window.HTMLElement.prototype.scrollTo = scrollToSpy

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live Session')).toBeInTheDocument()
      expect(MockEventSource.instances.length).toBeGreaterThan(0)
    })

    // Emit playing track
    act(() => {
      MockEventSource.instances[0].emit({
        current: { title: 'First Song', artist: 'First Artist', duration: 180 },
        queue: [],
      })
    })

    // Switch to lyrics tab
    fireEvent.click(screen.getByRole('button', { name: /^Lyrics/i }))

    await waitFor(() => {
      expect(screen.getByText('First line of lyrics')).toBeInTheDocument()
    })

    // Element scrollIntoView should NOT be called for auto-scrolling
    // (which would scroll the outer page/window)
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })
})
