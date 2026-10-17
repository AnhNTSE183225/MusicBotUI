import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
    getLyrics: vi.fn().mockResolvedValue({ lyrics: null }),
    getAIAutoQueue: vi.fn().mockResolvedValue({ enabled: false, prompt: '', count: 5, threshold: 2 }),
    setAIAutoQueue: vi.fn().mockResolvedValue({ status: 'ok' }),
    aiSuggest: vi.fn(),
    aiConfirmSong: vi.fn(),
    aiConfirmBatch: vi.fn(),
  }
})

describe('AI Auto-Queue UI & Fixes', () => {
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

  it('renders pulsing AI thinking indicator while searching and displays rich metadata', async () => {
    let resolveSuggest: any
    const suggestPromise = new Promise<{ songs: api.AISong[]; prompt: string }>((resolve) => {
      resolveSuggest = resolve
    })
    vi.mocked(api.aiSuggest).mockReturnValue(suggestPromise)
    vi.mocked(api.aiConfirmBatch).mockResolvedValue({ status: 'success', added_count: 2 })

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live Session')).toBeInTheDocument()
    })

    // Open AI Dialog
    const aiBtn = await screen.findByRole('button', { name: /AI Auto-Queue/i })
    fireEvent.click(aiBtn)

    // Fill in vibe prompt
    const promptInput = await screen.findByPlaceholderText(/lo-fi chill buổi tối/i)
    fireEvent.change(promptInput, { target: { value: 'night lofi' } })

    // Click "Find songs" button
    const findBtn = screen.getByRole('button', { name: /find songs/i })
    fireEvent.click(findBtn)

    // Expect pulsing AI Thinking state
    expect(screen.getByText(/AI is thinking/i)).toBeInTheDocument()
    expect(screen.getByText(/Tuning into your vibe/i)).toBeInTheDocument()

    // Resolve suggest call with 2 songs having rich artist & thumbnail metadata
    resolveSuggest({
      prompt: 'night lofi',
      songs: [
        {
          title: 'Midnight Beats',
          artist: 'Lofi Curator',
          duration: 180,
          url: 'https://www.youtube.com/watch?v=vid1',
          thumbnail: 'https://i.ytimg.com/vi/vid1/hqdefault.jpg',
        },
        {
          title: 'Rainy Night Jazz',
          artist: 'Jazz Master',
          duration: 240,
          url: 'https://www.youtube.com/watch?v=vid2',
          thumbnail: 'https://i.ytimg.com/vi/vid2/hqdefault.jpg',
        },
      ],
    })

    // Expect suggestions to appear with title & artist
    await waitFor(() => {
      expect(screen.getByText('Midnight Beats')).toBeInTheDocument()
      expect(screen.getByText('Lofi Curator')).toBeInTheDocument()
      expect(screen.getByText('Rainy Night Jazz')).toBeInTheDocument()
      expect(screen.getByText('Jazz Master')).toBeInTheDocument()
    })

    // Click "Add all" button
    const addAllBtn = screen.getByRole('button', { name: /add all/i })
    fireEvent.click(addAllBtn)

    // Verify aiConfirmBatch was called with both songs
    await waitFor(() => {
      expect(api.aiConfirmBatch).toHaveBeenCalledWith(
        'guild1',
        expect.arrayContaining([
          expect.objectContaining({ title: 'Midnight Beats', artist: 'Lofi Curator' }),
          expect.objectContaining({ title: 'Rainy Night Jazz', artist: 'Jazz Master' }),
        ])
      )
    })
  })

  it('allows toggling auto-queue outside and managing auto-fill vibe separately', async () => {
    vi.mocked(api.getAIAutoQueue).mockResolvedValue({
      enabled: false,
      prompt: 'jazz cà phê chill',
      count: 4,
      threshold: 3,
    })

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live Session')).toBeInTheDocument()
    })

    // Find outside switch
    const outsideToggle = await screen.findByRole('switch', { name: /Auto-fill/i })
    expect(outsideToggle).toBeInTheDocument()

    // Click outside toggle to turn ON
    fireEvent.click(outsideToggle)

    await waitFor(() => {
      expect(api.setAIAutoQueue).toHaveBeenCalledWith(
        'guild1',
        expect.objectContaining({ enabled: true, prompt: 'jazz cà phê chill' })
      )
    })

    // Open AI Dialog
    const settingsBtn = screen.getByRole('button', { name: /AI Auto-Queue/i })
    fireEvent.click(settingsBtn)

    // Switch to "Auto-fill Rules" tab
    const autoFillTab = screen.getByRole('button', { name: /Auto-fill Rules/i })
    fireEvent.click(autoFillTab)

    // Verify current vibe banner is displayed
    expect(screen.getByText('"jazz cà phê chill"')).toBeInTheDocument()
    expect(screen.getByText(/Current Auto-fill Vibe/i)).toBeInTheDocument()

    // Edit the auto-fill vibe separately from search
    const autoPromptInput = screen.getByLabelText(/Edit Auto-fill Vibe/i)
    fireEvent.change(autoPromptInput, { target: { value: 'acoustic sunset vibes' } })

    // Save auto-fill settings
    const saveBtn = screen.getByRole('button', { name: /Save Auto-fill Settings/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(api.setAIAutoQueue).toHaveBeenCalledWith(
        'guild1',
        expect.objectContaining({ prompt: 'acoustic sunset vibes' })
      )
    })
  })
})
