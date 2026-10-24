import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ScheduleView } from '@/components/ScheduleView'
import * as api from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    getSchedule: vi.fn(),
  }
})

describe('ScheduleView URL deep-linking & Modal Loop Prevention', () => {
  const testEvent = {
    id: 'ev-test-123',
    guildId: 'guild1',
    title: 'Movie Night & Chill',
    description: 'Come hang out and watch movies',
    start: '2026-10-31T20:00:00',
    durationMinutes: 120,
    recurrence: null,
    location: { type: 'voice' as const, channelId: 'vc1', channelName: 'Lobby' },
    links: [],
    organizerId: 'u1',
    inviteEveryone: true,
    inviteeIds: [],
    seriesResponses: {},
    occurrenceResponses: {},
    cancelledOccurrences: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/?tab=schedule&guild=guild1&event=ev-test-123')
    vi.mocked(api.getSchedule).mockResolvedValue({
      events: [testEvent],
      members: [
        { id: 'u1', name: 'OrganizerUser', avatar: '' },
        { id: 'u2', name: 'InviteeUser', avatar: '' },
      ],
      channels: [{ id: 'vc1', name: 'Lobby' }],
    })
  })

  it('auto-opens event from URL, closes cleanly on Close click, removes URL param, and avoids loop', async () => {
    render(
      <ScheduleView
        guildId="guild1"
        guildName="Test Guild"
        userId="u2"
        isAdmin={false}
      />
    )

    // Wait for the modal to auto-open with the event title
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Movie Night & Chill/i })).toBeInTheDocument()
    })

    // Find and click the Close button
    const closeBtn = screen.getAllByRole('button', { name: /^Close$/i })[0]
    fireEvent.click(closeBtn)

    // Verify modal is closed
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Movie Night & Chill/i })).not.toBeInTheDocument()
    })

    // Verify URL query param 'event' is removed
    const url = new URL(window.location.href)
    expect(url.searchParams.get('event')).toBeNull()
    expect(url.searchParams.get('tab')).toBe('schedule')
    expect(url.searchParams.get('guild')).toBe('guild1')

    // Modal must NOT re-open in a loop
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('heading', { name: /Movie Night & Chill/i })).not.toBeInTheDocument()
  })
})
