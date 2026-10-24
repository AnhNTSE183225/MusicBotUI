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
      expect(screen.getByText('Live')).toBeInTheDocument()
    })

    // Open AI Dialog to Search tab
    const searchBtn = await screen.findByRole('button', { name: /AI Search & Preview/i })
    fireEvent.click(searchBtn)

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
      expect(screen.getByText('Live')).toBeInTheDocument()
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

  it('limits preview suggestions to exactly the configured aiCount (5 songs when configured 5)', async () => {
    // Backend returns 8 songs, but configured count is 5
    const mockSongs: api.AISong[] = Array.from({ length: 8 }, (_, i) => ({
      title: `Song Number ${i + 1}`,
      artist: `Artist ${i + 1}`,
      duration: 180,
      url: `https://www.youtube.com/watch?v=song_${i + 1}`,
      thumbnail: `https://i.ytimg.com/vi/song_${i + 1}/hqdefault.jpg`,
    }))

    vi.mocked(api.aiSuggest).mockResolvedValue({
      prompt: 'chill beats',
      songs: mockSongs,
    })

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument()
    })

    // Open AI Dialog to Search tab
    const searchBtn = screen.getByRole('button', { name: /AI Search & Preview/i })
    fireEvent.click(searchBtn)

    // Ensure count input is 5
    const countInput = screen.getByLabelText(/Songs to preview/i) as HTMLInputElement
    expect(countInput.value).toBe('5')

    // Enter prompt and click find
    const promptInput = screen.getByPlaceholderText(/lo-fi chill buổi tối/i)
    fireEvent.change(promptInput, { target: { value: 'chill beats' } })
    const findBtn = screen.getByRole('button', { name: /find songs/i })
    fireEvent.click(findBtn)

    // Expect exactly 5 suggestions displayed, not 8
    await waitFor(() => {
      expect(screen.getByText('5 suggestions')).toBeInTheDocument()
      expect(screen.getByText('Song Number 1')).toBeInTheDocument()
      expect(screen.getByText('Song Number 5')).toBeInTheDocument()
      expect(screen.queryByText('Song Number 6')).not.toBeInTheDocument()
      expect(screen.queryByText('Song Number 8')).not.toBeInTheDocument()
    })
  })

  it('does not reject toggle changes or revert when SSE messages arrive while modal is open', async () => {
    vi.mocked(api.getAIAutoQueue).mockResolvedValue({
      enabled: false,
      prompt: 'ambient study',
      count: 5,
      threshold: 2,
    })

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument()
    })

    // Open AI Dialog
    const settingsBtn = screen.getByRole('button', { name: /AI Auto-Queue/i })
    fireEvent.click(settingsBtn)

    // Switch to "Auto-fill Rules" tab
    const autoFillTab = screen.getByRole('button', { name: /Auto-fill Rules/i })
    fireEvent.click(autoFillTab)

    // Find modal toggle switch
    const modalToggle = screen.getByRole('switch', { name: /Enable Auto-fill when queue runs low/i })
    expect(modalToggle).toHaveAttribute('aria-checked', 'false')

    // User toggles the switch to ON
    fireEvent.click(modalToggle)
    expect(modalToggle).toHaveAttribute('aria-checked', 'true')

    // Simulate incoming SSE event broadcasting stale ai_auto_enabled: false
    const sseInstance = MockEventSource.instances[0]
    expect(sseInstance).toBeDefined()
    sseInstance.emit({
      current: null,
      queue: [],
      ai_auto_enabled: false,
      bot_connected: true,
    })

    // The modal toggle must NOT revert back to false!
    expect(modalToggle).toHaveAttribute('aria-checked', 'true')

    // Click "Save Auto-fill Settings"
    const saveBtn = screen.getByRole('button', { name: /Save Auto-fill Settings/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(api.setAIAutoQueue).toHaveBeenCalledWith(
        'guild1',
        expect.objectContaining({ enabled: true, prompt: 'ambient study' })
      )
    })
  })

  it('renders app logo as avatar for tracks added by AI Auto-Queue', async () => {
    vi.mocked(api.getAIAutoQueue).mockResolvedValue({
      status: 'ok',
      config: { enabled: true, prompt: 'chill beats', count: 5, threshold: 2 }
    })

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument()
    })

    const sseInstance = MockEventSource.instances[0]
    expect(sseInstance).toBeDefined()

    sseInstance.emit({
      current: {
        title: 'Current AI Track',
        artist: 'AI Artist',
        requester_handle: 'AI Auto-Queue',
        requester_avatar: '/logo_icon.svg',
      },
      queue: [
        {
          title: 'Queued AI Track',
          artist: 'AI Artist 2',
          requester_handle: 'AI Auto-Queue',
          requester_avatar: 'https://cdn.discordapp.com/avatars/user123/old_avatar.png',
        }
      ],
      ai_auto_enabled: true,
      bot_connected: true,
    })

    await waitFor(() => {
      expect(screen.getByText('Current AI Track')).toBeInTheDocument()
      expect(screen.getByText('Queued AI Track')).toBeInTheDocument()
    })

    const avatars = screen.getAllByAltText('AI Auto-Queue')
    expect(avatars.length).toBeGreaterThanOrEqual(2)
    avatars.forEach(avatar => {
      expect(avatar.getAttribute('src')).toContain('logo_icon.svg')
    })
  })
})

