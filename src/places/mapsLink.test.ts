import { describe, expect, it } from 'vitest'
import { parseMapsLink, looksLikeMapsLink } from './mapsLink'

describe('parseMapsLink', () => {
  it('parses raw "lat, lng"', () => {
    expect(parseMapsLink('48.8584, 2.2945')).toEqual({ kind: 'place', lat: 48.8584, lng: 2.2945 })
    expect(parseMapsLink('  -33.8688,151.2093 ')).toEqual({ kind: 'place', lat: -33.8688, lng: 151.2093 })
  })

  it('rejects out-of-range coordinates', () => {
    expect(parseMapsLink('200, 2').kind).toBe('unrecognized')
    expect(parseMapsLink('48, 500').kind).toBe('unrecognized')
  })

  it('parses geo: URIs, preferring q= over a 0,0 placeholder', () => {
    expect(parseMapsLink('geo:48.8584,2.2945')).toMatchObject({ kind: 'place', lat: 48.8584, lng: 2.2945 })
    expect(parseMapsLink('geo:0,0?q=48.8584,2.2945(Eiffel Tower)')).toEqual({
      kind: 'place',
      lat: 48.8584,
      lng: 2.2945,
      name: 'Eiffel Tower',
    })
  })

  it('prefers the Google !3d!4d marker over the @ viewport', () => {
    const r = parseMapsLink(
      'https://www.google.com/maps/place/Eiffel+Tower/@48.8000,2.2000,17z/data=!3m1!4b1!3d48.8583701!4d2.2944813',
    )
    expect(r).toMatchObject({ kind: 'place', lat: 48.8583701, lng: 2.2944813, name: 'Eiffel Tower' })
  })

  it('parses Google query/search and @ viewport links', () => {
    expect(parseMapsLink('https://www.google.com/maps/search/?api=1&query=48.8584,2.2945')).toMatchObject({
      kind: 'place',
      lat: 48.8584,
      lng: 2.2945,
    })
    expect(parseMapsLink('https://maps.google.com/?q=40.6892,-74.0445')).toMatchObject({
      kind: 'place',
      lat: 40.6892,
      lng: -74.0445,
    })
    expect(parseMapsLink('https://www.google.com/maps/@48.8584,2.2945,17z')).toMatchObject({
      kind: 'place',
      lat: 48.8584,
      lng: 2.2945,
    })
  })

  it('parses Apple Maps ll / coordinate / center params', () => {
    expect(parseMapsLink('https://maps.apple.com/?ll=48.8584,2.2945&q=Eiffel%20Tower')).toEqual({
      kind: 'place',
      lat: 48.8584,
      lng: 2.2945,
      name: 'Eiffel Tower',
    })
    expect(parseMapsLink('https://maps.apple.com/place?coordinate=51.5,-0.12')).toMatchObject({
      kind: 'place',
      lat: 51.5,
      lng: -0.12,
    })
    expect(parseMapsLink('https://beta.maps.apple.com/?center=40.7,-74.0')).toMatchObject({
      kind: 'place',
      lat: 40.7,
      lng: -74,
    })
  })

  it('defers short links to the server resolver', () => {
    expect(parseMapsLink('https://maps.app.goo.gl/UEHcAynGb94nYq4X6')).toEqual({
      kind: 'needs-resolver',
      url: 'https://maps.app.goo.gl/UEHcAynGb94nYq4X6',
    })
    expect(parseMapsLink('https://goo.gl/maps/abc123').kind).toBe('needs-resolver')
  })

  it('defers Apple short links / coordinate-less maps links to the resolver', () => {
    expect(parseMapsLink('https://maps.apple/p/MNTAy4scPq-1xy').kind).toBe('needs-resolver')
    expect(parseMapsLink('https://maps.apple.com/?address=10%20Rue%20de%20Paris').kind).toBe('needs-resolver')
  })

  it('returns unrecognized for non-maps input', () => {
    expect(parseMapsLink('just some text').kind).toBe('unrecognized')
    expect(parseMapsLink('https://example.com/foo').kind).toBe('unrecognized')
    expect(parseMapsLink('').kind).toBe('unrecognized')
  })
})

describe('looksLikeMapsLink', () => {
  it('recognizes maps URLs and geo URIs, not arbitrary text', () => {
    expect(looksLikeMapsLink('https://maps.app.goo.gl/x')).toBe(true)
    expect(looksLikeMapsLink('https://www.google.com/maps/place/x')).toBe(true)
    expect(looksLikeMapsLink('geo:1,2')).toBe(true)
    expect(looksLikeMapsLink('https://example.com')).toBe(false)
    expect(looksLikeMapsLink('hello')).toBe(false)
  })
})
