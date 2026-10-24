import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import * as api from '@/lib/api'
import { isYouTubePlaylistUrl, cleanPlaylistUrl } from '@/lib/youtube'
import { PlaylistModal } from '@/components/PlaylistModal'
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
    previewPlaylist: vi.fn(),
    addPlaylist: vi.fn(),
    addSong: vi.fn(),
  }
})

describe('YouTube Playlist Detection Utility', () => {
  it('correctly detects various YouTube playlist URL formats', () => {
    // Standard playlist
    expect(isYouTubePlaylistUrl('https://www.youtube.com/playlist?list=PLrAlGndGk_3fFm_H4P-uO_T4tXGfW2nC3')).toBe(true)
    // Short domain
    expect(isYouTubePlaylistUrl('https://youtube.com/playlist?list=PL12345')).toBe(true)
    // YouTube Music
    expect(isYouTubePlaylistUrl('https://music.youtube.com/playlist?list=PLrAlGndGk_3fFm_H4P-uO_T4tXGfW2nC3')).toBe(true)
    // Video in a playlist
    expect(isYouTubePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAlGndGk_3fFm_H4P-uO_T4tXGfW2nC3')).toBe(true)
    // Short link with list
    expect(isYouTubePlaylistUrl('https://youtu.be/dQw4w9WgXcQ?list=PLrAlGndGk_3fFm_H4P-uO_T4tXGfW2nC3')).toBe(true)
    // Mix / radio
    expect(isYouTubePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ')).toBe(true)
  })

  it('rejects non-playlist URLs, private lists, and plain queries', () => {
    // Single video without list
    expect(isYouTubePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
    // Private Liked Videos
    expect(isYouTubePlaylistUrl('https://www.youtube.com/playlist?list=LL')).toBe(false)
    // Private Watch Later
    expect(isYouTubePlaylistUrl('https://www.youtube.com/playlist?list=WL')).toBe(false)
    // Plain text search query
    expect(isYouTubePlaylistUrl('lofi hip hop radio')).toBe(false)
    // Non-youtube URL with list param
    expect(isYouTubePlaylistUrl('https://example.com/playlist?list=123')).toBe(false)
    // Empty / whitespace
    expect(isYouTubePlaylistUrl('')).toBe(false)
    expect(isYouTubePlaylistUrl('   ')).toBe(false)
  })

  it('cleans playlist URLs to canonical format', () => {
    expect(cleanPlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345')).toBe('https://www.youtube.com/playlist?list=PL12345')
    expect(cleanPlaylistUrl('https://www.youtube.com/watch?v=abc&list=RDabc')).toBe('https://www.youtube.com/watch?v=abc&list=RDabc')
  })
})

describe('PlaylistModal Component', () => {
  const mockPreviewData: api.PlaylistPreviewResponse = {
    title: 'Top Hits 2026',
    uploader: 'Cool Channel',
    thumbnail: 'https://i.ytimg.com/vi/123/maxresdefault.jpg',
    total_tracks: 15,
    tracks: Array.from({ length: 15 }, (_, i) => ({
      index: i + 1,
      id: `track-${i + 1}`,
      title: `Song Number ${i + 1}`,
      artist: `Artist ${i + 1}`,
      duration: 180 + i * 10,
      url: `https://www.youtube.com/watch?v=track-${i + 1}`,
      thumbnail: `https://i.ytimg.com/vi/track-${i + 1}/hqdefault.jpg`,
    })),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders modal when open and fetches playlist preview', async () => {
    vi.mocked(api.previewPlaylist).mockResolvedValue(mockPreviewData)

    render(
      <PlaylistModal
        open={true}
        onOpenChange={() => {}}
        currentGuildId="guild1"
        isVoiceConnected={true}
        initialUrl="https://www.youtube.com/playlist?list=PL12345"
      />
    )

    await waitFor(() => {
      expect(api.previewPlaylist).toHaveBeenCalledWith('guild1', 'https://www.youtube.com/playlist?list=PL12345')
    })

    // Verify preview card shows playlist title and total songs
    await waitFor(() => {
      expect(screen.getByText('Top Hits 2026')).toBeInTheDocument()
      expect(screen.getByText('15 songs')).toBeInTheDocument()
      expect(screen.getByText('Song Number 1')).toBeInTheDocument()
      expect(screen.getByText('Song Number 15')).toBeInTheDocument()
    })
  })

  it('allows range selection (from song to song) and calculates selected count', async () => {
    vi.mocked(api.previewPlaylist).mockResolvedValue(mockPreviewData)

    render(
      <PlaylistModal
        open={true}
        onOpenChange={() => {}}
        currentGuildId="guild1"
        isVoiceConnected={true}
        initialUrl="https://www.youtube.com/playlist?list=PL12345"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Top Hits 2026')).toBeInTheDocument()
    })

    // Initially all 15 songs selected (1 to 15)
    expect(screen.getByText('15 tracks selected (#1 to #15)')).toBeInTheDocument()

    // Test preset "First 10"
    const first10Btn = screen.getByRole('button', { name: /First 10/i })
    fireEvent.click(first10Btn)

    expect(screen.getByText('10 tracks selected (#1 to #10)')).toBeInTheDocument()

    // Test changing "From song" input to 3 and "To song" to 7
    const fromInput = screen.getByLabelText(/From song:/i)
    const toInput = screen.getByLabelText(/To song:/i)

    fireEvent.change(fromInput, { target: { value: '3' } })
    fireEvent.change(toInput, { target: { value: '7' } })

    expect(screen.getByText('5 tracks selected (#3 to #7)')).toBeInTheDocument()
  })

  it('submits selected slice of tracks to addPlaylist when Add button is clicked', async () => {
    vi.mocked(api.previewPlaylist).mockResolvedValue(mockPreviewData)
    vi.mocked(api.addPlaylist).mockResolvedValue({
      status: 'success',
      added_count: 5,
      playlist_title: 'Top Hits 2026',
    })

    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <PlaylistModal
        open={true}
        onOpenChange={onOpenChange}
        currentGuildId="guild1"
        isVoiceConnected={true}
        initialUrl="https://www.youtube.com/playlist?list=PL12345"
        onSuccess={onSuccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Top Hits 2026')).toBeInTheDocument()
    })

    // Set range from 3 to 7
    const fromInput = screen.getByLabelText(/From song:/i)
    const toInput = screen.getByLabelText(/To song:/i)
    fireEvent.change(fromInput, { target: { value: '3' } })
    fireEvent.change(toInput, { target: { value: '7' } })

    const addBtn = screen.getByRole('button', { name: /Add 5 songs/i })
    fireEvent.click(addBtn)

    await waitFor(() => {
      expect(api.addPlaylist).toHaveBeenCalledWith('guild1', {
        title: 'Top Hits 2026',
        start_index: 3,
        end_index: 7,
        tracks: expect.arrayContaining([
          expect.objectContaining({ title: 'Song Number 3' }),
          expect.objectContaining({ title: 'Song Number 7' }),
        ]),
      })
      expect(onSuccess).toHaveBeenCalledWith(5, 'Top Hits 2026')
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})

describe('UI Integration & Frontend Interception', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('renders separate subtle playlist add button in queue search bar', async () => {
    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add playlist/i })).toBeInTheDocument()
    })

    // Click playlist button opens the playlist modal
    const playlistBtn = screen.getByRole('button', { name: /Add playlist/i })
    fireEvent.click(playlistBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Add YouTube Playlist/i })).toBeInTheDocument()
    })
  })

  it('intercepts playlist URLs pasted into the search bar without calling single song addSong', async () => {
    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Paste a link or search for a song/i)).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Paste a link or search for a song/i)
    const addBtn = screen.getByRole('button', { name: /Add to queue/i })

    // User pastes a playlist URL
    fireEvent.change(searchInput, {
      target: { value: 'https://www.youtube.com/playlist?list=PLrAlGndGk_3fFm_H4P-uO_T4tXGfW2nC3' },
    })

    // User submits
    fireEvent.click(addBtn)

    // Should NOT call addSong on backend!
    expect(api.addSong).not.toHaveBeenCalled()

    // Instead, it intercepted and opened the Playlist Modal with this URL
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Add YouTube Playlist/i })).toBeInTheDocument()
      expect(api.previewPlaylist).toHaveBeenCalledWith('guild1', 'https://www.youtube.com/playlist?list=PLrAlGndGk_3fFm_H4P-uO_T4tXGfW2nC3')
    })
  })
})
