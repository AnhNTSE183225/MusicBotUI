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

  it('displays join voice channel overlay and blurs main UI when logged in but not in VC', async () => {
    vi.mocked(api.checkAuth).mockResolvedValue({ id: '12345', username: 'TestUser', avatar: null })
    vi.mocked(api.getGuilds).mockResolvedValue({ guilds: [] })

    const Component = Route.options.component!
    render(<Component />)

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

  it('renders open-source contribution section with UI and backend github links', async () => {
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
      expect(screen.getByText('Want to contribute or report a bug?')).toBeInTheDocument()
    })

    const uiLink = screen.getAllByRole('link', { name: /AnhNTSE183225\/MusicBotUI/i })[0]
    expect(uiLink).toHaveAttribute('href', 'https://github.com/AnhNTSE183225/MusicBotUI')

    const backendLink = screen.getAllByRole('link', { name: /AnhNTSE183225\/music-bot/i })[0]
    expect(backendLink).toHaveAttribute('href', 'https://github.com/AnhNTSE183225/music-bot')
  })
})

