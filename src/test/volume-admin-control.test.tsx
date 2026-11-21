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
    getSchedule: vi.fn().mockResolvedValue({ events: [], members: [], channels: [] }),
    getGeminiKeys: vi.fn().mockResolvedValue({ keys: [] }),
    controlVolume: vi.fn().mockResolvedValue({ status: 'success' }),
  }
})

describe('Master Volume Admin Authorization in UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockEventSource.instances = []
    ;(globalThis as any).EventSource = MockEventSource
    localStorage.clear()
    vi.mocked(api.checkAuth).mockResolvedValue({ id: 'user-regular', username: 'Listener', avatar: null })
  })

  it('disables master volume controls for non-admin users and never calls controlVolume', async () => {
    vi.mocked(api.getGuilds).mockResolvedValue({
      guilds: [
        {
          id: 'guild1',
          name: 'Test Server',
          icon: null,
          channel_id: 'ch1',
          channel_name: 'General',
          bot_connected: true,
          is_admin: false,
        },
      ],
    })

    const Component = Route.options.component as any
    render(<Component />)

    const muteBtn = await screen.findByRole('button', { name: /Master volume \(Admin only\)/i })
    expect(muteBtn).toBeDisabled()

    const sliderThumb = screen.getByRole('slider')
    expect(sliderThumb).toHaveAttribute('data-disabled', '')

    fireEvent.click(muteBtn)
    expect(api.controlVolume).not.toHaveBeenCalled()
  })

  it('enables master volume controls for guild admins and calls controlVolume', async () => {
    vi.mocked(api.getGuilds).mockResolvedValue({
      guilds: [
        {
          id: 'guild1',
          name: 'Test Server',
          icon: null,
          channel_id: 'ch1',
          channel_name: 'General',
          bot_connected: true,
          is_admin: true,
        },
      ],
    })

    const Component = Route.options.component as any
    render(<Component />)

    const muteBtn = await screen.findByRole('button', { name: /Mute volume/i })
    expect(muteBtn).not.toBeDisabled()

    const sliderThumb = screen.getByRole('slider')
    expect(sliderThumb).not.toHaveAttribute('data-disabled')

    fireEvent.click(muteBtn)
    await waitFor(() => {
      expect(api.controlVolume).toHaveBeenCalledWith('guild1', 0)
    })
  })
})
