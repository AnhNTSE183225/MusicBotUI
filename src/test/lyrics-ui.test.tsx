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

    // Switching tab via player button activates Lyrics tab and keeps header intact
    fireEvent.click(viewLyricsControl)
    expect(lyricsTab).toHaveClass('active-tab')
    expect(screen.getByRole('heading', { level: 2, name: /Up next/i })).toBeInTheDocument()
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

  it('joins syllables within the same word without spacing and adds space after word boundaries', async () => {
    const mockLyrics = {
      type: 'syllable' as const,
      provider: 'applemusic',
      lines: [
        {
          begin: 0,
          end: 10,
          text: 'Heart, unbreakable',
          words: [
            { begin: 0, end: 1, text: 'Heart,' },
            { begin: 2, end: 3, text: 'un' },
            { begin: 3, end: 4, text: 'break' },
            { begin: 4, end: 5, text: 'a' },
            { begin: 5, end: 6, text: 'ble' },
          ],
        },
      ],
    }
    vi.mocked(api.getLyrics).mockResolvedValue({ lyrics: mockLyrics })

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live Session')).toBeInTheDocument()
      expect(MockEventSource.instances.length).toBeGreaterThan(0)
    })

    act(() => {
      MockEventSource.instances[0].emit({
        current: { title: 'Unbreakable', artist: 'Artist', duration: 180 },
        queue: [],
      })
    })

    // Switch to lyrics tab
    fireEvent.click(screen.getByRole('button', { name: /^Lyrics/i }))

    await waitFor(() => {
      expect(screen.getByText('Heart,')).toBeInTheDocument()
      expect(screen.getByText('un')).toBeInTheDocument()
      expect(screen.getByText('break')).toBeInTheDocument()
      expect(screen.getByText('a')).toBeInTheDocument()
      expect(screen.getByText('ble')).toBeInTheDocument()
    })

    // "Heart," is followed by a space in "Heart, unbreakable", so it has has-space
    expect(screen.getByText('Heart,')).toHaveClass('has-space')

    // "un", "break", "a" are syllables inside "unbreakable", so they must NOT have has-space
    expect(screen.getByText('un')).not.toHaveClass('has-space')
    expect(screen.getByText('break')).not.toHaveClass('has-space')
    expect(screen.getByText('a')).not.toHaveClass('has-space')

    // "ble" is at the end of the line/word, so it does not have has-space
    expect(screen.getByText('ble')).not.toHaveClass('has-space')
  })

  it('allows user to click on a lyric line to set the sync timing to that line with delay offset and reset', async () => {
    const mockLyrics = {
      type: 'line' as const,
      provider: 'lrclib',
      lines: [
        { begin: 0, end: 10, text: 'Line one starting at zero' },
        { begin: 25, end: 35, text: 'Line two starting at 25s' },
        { begin: 60, end: 75, text: 'Line three starting at 60s' },
      ],
    }
    vi.mocked(api.getLyrics).mockResolvedValue({ lyrics: mockLyrics })

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live Session')).toBeInTheDocument()
      expect(MockEventSource.instances.length).toBeGreaterThan(0)
    })

    act(() => {
      MockEventSource.instances[0].emit({
        current: { title: 'Sync Test Song', artist: 'Artist', duration: 180 },
        position: 10,
        is_paused: true,
        stopped: false,
        queue: [],
      })
    })

    fireEvent.click(screen.getByRole('button', { name: /^Lyrics/i }))

    await waitFor(() => {
      expect(screen.getByText('Line two starting at 25s')).toBeInTheDocument()
    })

    const lineTwo = screen.getByRole('button', { name: /Line two starting at 25s/i })
    expect(lineTwo).toBeInTheDocument()

    act(() => {
      fireEvent.click(lineTwo)
    })

    await waitFor(() => {
      expect(screen.getByText('+15.0s')).toBeInTheDocument()
    })

    const resetBtn = screen.getByRole('button', { name: /Reset/i })
    expect(resetBtn).toBeInTheDocument()

    act(() => {
      fireEvent.click(resetBtn)
    })

    await waitFor(() => {
      expect(screen.getByText('+0.0s')).toBeInTheDocument()
    })
  })
})

