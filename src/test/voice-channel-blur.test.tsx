import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import * as api from '@/lib/api'
import { Route } from '@/routes/index'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    checkAuth: vi.fn(),
    getGuilds: vi.fn(),
    getStreamUrl: vi.fn().mockResolvedValue('http://localhost:8000/api/stream/123'),
    getLyrics: vi.fn().mockResolvedValue({ lyrics: null }),
    getAIAutoQueue: vi.fn().mockResolvedValue({ enabled: false }),
  }
})

describe('Voice channel gating & Contribution section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays sign in overlay and blurs main UI when not logged in', async () => {
    vi.mocked(api.checkAuth).mockResolvedValue(null)
    vi.mocked(api.getGuilds).mockResolvedValue({ guilds: [] })

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Sign in to listen')).toBeInTheDocument()
    })

    const main = document.querySelector('.room-main')
    expect(main).toHaveStyle('filter: blur(12px)')
    expect(main).toHaveStyle('pointer-events: none')
    expect(main).toHaveAttribute('inert')
  })

  it('automatically redirects to Schedule tab when logged in but not in VC, and displays join voice channel overlay when switching to Listening room', async () => {
    vi.mocked(api.checkAuth).mockResolvedValue({ id: '12345', username: 'TestUser', avatar: null })
    vi.mocked(api.getGuilds).mockResolvedValue({ guilds: [] })

    const Component = Route.options.component!
    render(<Component />)

    // Automatically redirected to Schedule tab on load when not in VC
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Server schedule/i })).toBeInTheDocument()
    })

    // User navigates back to Listening room
    const listeningBtn = screen.getByRole('tab', { name: /Listening room/i })
    listeningBtn.click()

    await waitFor(() => {
      expect(screen.getByText('Join a voice channel')).toBeInTheDocument()
      expect(screen.getByText(/TestUser/)).toBeInTheDocument()
      expect(screen.getByText("I've joined a voice channel")).toBeInTheDocument()
    })

    const main = document.querySelector('.room-main')
    expect(main).toHaveStyle('filter: blur(12px)')
    expect(main).toHaveStyle('pointer-events: none')
    expect(main).toHaveAttribute('inert')
  })

  it('unblurs UI and shows live session when user is in a voice channel', async () => {
    vi.mocked(api.checkAuth).mockResolvedValue({ id: '12345', username: 'TestUser', avatar: null })
    vi.mocked(api.getGuilds).mockResolvedValue({
      guilds: [
        {
          id: 'guild1',
          name: 'Cool Server',
          channel_id: 'vc1',
          channel_name: 'music-lounge',
          bot_connected: true,
        },
      ],
    })

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live Session')).toBeInTheDocument()
    })

    const main = document.querySelector('.room-main')
    expect(main).not.toHaveStyle('filter: blur(12px)')
    expect(main).not.toHaveAttribute('inert')
  })

  it('opens contribution modal with UI and backend github links from footer', async () => {
    vi.mocked(api.checkAuth).mockResolvedValue({ id: '12345', username: 'TestUser', avatar: null })
    vi.mocked(api.getGuilds).mockResolvedValue({
      guilds: [
        {
          id: 'guild1',
          name: 'Cool Server',
          channel_id: 'vc1',
          channel_name: 'general',
          bot_connected: true,
        },
      ],
    })

    const Component = Route.options.component!
    render(<Component />)

    await waitFor(() => {
      expect(screen.getByText('Live Session')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Contribute & Bugs/i })).toBeInTheDocument()
    })

    const contributeBtn = screen.getByRole('button', { name: /Contribute & Bugs/i })
    contributeBtn.click()

    await waitFor(() => {
      expect(screen.getByText('Contribute to MusicBỏTúi & Report Bugs')).toBeInTheDocument()
    })

    const uiLink = screen.getAllByRole('link', { name: /AnhNTSE183225\/MusicBotUI/i })[0]
    expect(uiLink).toHaveAttribute('href', 'https://github.com/AnhNTSE183225/MusicBotUI')

    const backendLink = screen.getAllByRole('link', { name: /AnhNTSE183225\/music-bot/i })[0]
    expect(backendLink).toHaveAttribute('href', 'https://github.com/AnhNTSE183225/music-bot')
  })

  it('allows accessing Calendar without voice channel and provides server selector', async () => {
    vi.mocked(api.checkAuth).mockResolvedValue({ id: '12345', username: 'TestUser', avatar: null })
    vi.mocked(api.getGuilds).mockResolvedValue({
      guilds: [
        {
          id: 'guild1',
          name: 'Gaming Community',
          bot_connected: false,
        },
        {
          id: 'guild2',
          name: 'Anime Lounge',
          bot_connected: false,
        },
      ],
    })

    const Component = Route.options.component!
    render(<Component />)

    // Automatically lands directly on Schedule tab without voice channel gating
    await waitFor(() => {
      expect(screen.queryByText('Join a voice channel')).not.toBeInTheDocument()
      expect(screen.getByRole('region', { name: /Server schedule/i })).toBeInTheDocument()
    })

    const main = document.querySelector('.room-main')
    expect(main).not.toHaveStyle('filter: blur(12px)')
    expect(main).not.toHaveAttribute('inert')
  })
})
