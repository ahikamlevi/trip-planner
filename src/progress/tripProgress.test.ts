import { describe, it, expect } from 'vitest'
import { computeTripProgress, READY_THRESHOLD, type TripProgressInput } from './tripProgress'

const empty: TripProgressInput = {
  started: false,
  destinationCount: 0,
  hasTripDates: false,
  datedDestinations: 0,
  scheduledPlaces: 0,
  transportSet: 0,
  budgetEntries: 0,
  pricedPlaces: 0,
  packingItems: 0,
}

describe('computeTripProgress', () => {
  it('is 0% before a trip is started', () => {
    expect(computeTripProgress(empty).percent).toBe(0)
  })

  it('grants an endowed head-start the moment a trip exists', () => {
    const p = computeTripProgress({ ...empty, started: true })
    expect(p.percent).toBe(15)
    expect(p.percent).toBeGreaterThan(0) // never a demotivating zero
  })

  it('points to the first incomplete step as the next action', () => {
    const p = computeTripProgress({ ...empty, started: true })
    expect(p.nextStep?.key).toBe('destinations')
    expect(p.nextStep?.tab).toBe('route')
  })

  it('auto-completes the transport step for single-city trips', () => {
    const oneCity = computeTripProgress({ ...empty, started: true, destinationCount: 1 })
    const transport = oneCity.steps.find((s) => s.key === 'transport')
    expect(transport?.done).toBe(true)
  })

  it('requires explicit transport for multi-city trips', () => {
    const multi = computeTripProgress({ ...empty, started: true, destinationCount: 2 })
    expect(multi.steps.find((s) => s.key === 'transport')?.done).toBe(false)
    const withTransport = computeTripProgress({ ...empty, started: true, destinationCount: 2, transportSet: 1 })
    expect(withTransport.steps.find((s) => s.key === 'transport')?.done).toBe(true)
  })

  it('counts priced places as budget engagement', () => {
    const p = computeTripProgress({ ...empty, started: true, pricedPlaces: 1 })
    expect(p.steps.find((s) => s.key === 'budget')?.done).toBe(true)
  })

  it('reaches 100% and marks complete when every step is done', () => {
    const full: TripProgressInput = {
      started: true,
      destinationCount: 2,
      hasTripDates: true,
      datedDestinations: 2,
      scheduledPlaces: 4,
      transportSet: 1,
      budgetEntries: 3,
      pricedPlaces: 2,
      packingItems: 6,
    }
    const p = computeTripProgress(full)
    expect(p.percent).toBe(100)
    expect(p.complete).toBe(true)
    expect(p.nextStep).toBeNull()
    expect(p.ready).toBe(true)
  })

  it('marks ready at the threshold without being fully complete', () => {
    // start+dest+dates+stops+transport+budget = 95, packing missing
    const p = computeTripProgress({
      started: true,
      destinationCount: 2,
      hasTripDates: true,
      datedDestinations: 2,
      scheduledPlaces: 4,
      transportSet: 1,
      budgetEntries: 1,
      pricedPlaces: 0,
      packingItems: 0,
    })
    expect(p.percent).toBeGreaterThanOrEqual(READY_THRESHOLD)
    expect(p.ready).toBe(true)
    expect(p.complete).toBe(false)
  })
})
