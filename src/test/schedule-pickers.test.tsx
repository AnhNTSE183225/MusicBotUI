import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  isGoogleMapsShortlink,
  LocationMapPreview,
  CustomDurationPicker,
} from '@/components/ScheduleCustomPickers'
import { googleMapsUrl } from '@/lib/schedule'

describe('Schedule Custom Controls & Map Preview', () => {
  it('correctly identifies Google Maps shortlinks vs plain addresses', () => {
    expect(isGoogleMapsShortlink('https://maps.app.goo.gl/3ozTHfBgDKqtBVCd9')).toBe(true)
    expect(isGoogleMapsShortlink('http://goo.gl/maps/abc123xyz')).toBe(true)
    expect(isGoogleMapsShortlink('https://www.google.com/maps/place/SomePlace')).toBe(true)
    expect(isGoogleMapsShortlink('123 Main Street, Springfield, USA')).toBe(false)
    expect(isGoogleMapsShortlink('Building 4, Room 201')).toBe(false)
  })

  it('googleMapsUrl preserves external links and formats queries for plain addresses', () => {
    const shortlink = 'https://maps.app.goo.gl/3ozTHfBgDKqtBVCd9'
    expect(googleMapsUrl(shortlink)).toBe(shortlink)

    const address = 'Times Square, New York'
    expect(googleMapsUrl(address)).toBe('https://www.google.com/maps/search/?api=1&query=Times%20Square%2C%20New%20York')
  })

  it('renders Google Maps Location card when a shortlink is passed', () => {
    const shortlink = 'https://maps.app.goo.gl/3ozTHfBgDKqtBVCd9'
    render(<LocationMapPreview address={shortlink} />)

    expect(screen.getByText('Google Maps Location')).toBeInTheDocument()
    expect(screen.getByText('Open in Google Maps')).toHaveAttribute('href', shortlink)
  })

  it('renders Duration Picker with compact trigger and opens preset dropdown', () => {
    let duration = 60
    render(<CustomDurationPicker value={duration} onChange={(val) => { duration = val }} />)

    const trigger = screen.getByRole('button', { expanded: false })
    expect(trigger).toHaveTextContent('1 hr')

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByText('30m')).toBeInTheDocument()
    expect(screen.getByText('1.5h')).toBeInTheDocument()
    expect(screen.getByText('2h')).toBeInTheDocument()
  })
})
