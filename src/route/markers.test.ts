import { describe, it, expect } from 'vitest'
import { buildRouteMarkers } from './markers'

const BKK = { lat: 13.7563, lng: 100.5018 }
const PATTAYA = { lat: 12.9236, lng: 100.8825 }
const PHUKET = { lat: 7.8804, lng: 98.3923 }

describe('buildRouteMarkers', () => {
  it('merges a revisited city into one pin showing both stop numbers', () => {
    const markers = buildRouteMarkers([
      { name: 'Bangkok', ...BKK },
      { name: 'Pattaya', ...PATTAYA },
      { name: 'Phuket', ...PHUKET },
      { name: 'Bangkok', ...BKK },
    ])
    expect(markers).toHaveLength(3)
    const bkk = markers.find((m) => m.name === 'Bangkok')
    expect(bkk?.badge).toBe('1·4')
  })

  it('matches the same city by name even when the two geocodes differ slightly', () => {
    const markers = buildRouteMarkers([
      { name: 'Bangkok', lat: 13.7563, lng: 100.5018 },
      { name: 'Phuket', ...PHUKET },
      { name: 'bangkok ', lat: 13.751, lng: 100.494 }, // different case/spacing + drift
    ])
    expect(markers).toHaveLength(2)
    expect(markers.find((m) => m.name === 'Bangkok')?.badge).toBe('1·3')
  })

  it('still numbers a revisit when the first visit failed to geocode', () => {
    const markers = buildRouteMarkers([
      { name: 'Bangkok', lat: null, lng: null }, // first visit not located
      { name: 'Phuket', ...PHUKET },
      { name: 'Bangkok', ...BKK }, // later visit located
    ])
    const bkk = markers.find((m) => m.name === 'Bangkok')
    expect(bkk).toBeTruthy()
    expect(bkk?.badge).toBe('1·3')
    expect(bkk?.lat).toBe(BKK.lat)
  })

  it('drops a city with no located visit at all', () => {
    const markers = buildRouteMarkers([
      { name: 'Atlantis', lat: null, lng: null },
      { name: 'Phuket', ...PHUKET },
    ])
    expect(markers.map((m) => m.name)).toEqual(['Phuket'])
  })
})
