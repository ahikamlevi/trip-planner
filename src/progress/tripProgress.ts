// Trip completion model — the engine behind the "X% planned" meter.
//
// Grounded in the research: a goal-gradient progress bar with an *endowed*
// head-start (users never see 0%) pulls people toward completion, fights
// abandonment, and — because the IKEA effect only pays off on a *finished*
// build — turns "started a trip" into "finished a trip I value".
//
// This module is intentionally a pure function over plain counts so it is
// trivially testable and reused by both TripView (full meter) and the
// Dashboard (compact per-card bar).

/** Section keys map to the TripView tabs so the "next step" can deep-link. */
export type ProgressTab = 'route' | 'itinerary' | 'budget' | 'packing'

/** Raw, already-counted inputs. Anything unknown should be passed as 0/false. */
export interface TripProgressInput {
  /** True once the trip exists & is named — the endowed head-start. */
  started: boolean
  /** Number of destinations/cities on the route (areas). */
  destinationCount: number
  /** Trip has both a start and end date. */
  hasTripDates: boolean
  /** Destinations that have their own dates set. */
  datedDestinations: number
  /** Places marked scheduled — i.e. at least one day has a stop. */
  scheduledPlaces: number
  /** Destinations with a transport mode set (how you get between cities). */
  transportSet: number
  /** Manual budget entries logged. */
  budgetEntries: number
  /** Stops/places carrying an estimated cost (counts toward "budget engaged"). */
  pricedPlaces: number
  /** Packing checklist items added. */
  packingItems: number
}

export interface ProgressStep {
  key: string
  /** i18n key for the label. */
  labelKey: string
  weight: number
  done: boolean
  /** Which tab to open when the user acts on this step. */
  tab: ProgressTab
}

export interface TripProgress {
  /** 0–100, rounded. Never below the endowed floor once started. */
  percent: number
  steps: ProgressStep[]
  /** First incomplete step, or null when the trip is fully planned. */
  nextStep: ProgressStep | null
  /** True once every step is complete (drives the celebration peak). */
  complete: boolean
  /** True once the trip is "ready" (>= READY_THRESHOLD). */
  ready: boolean
}

/** Crossing this fires the trip-ready celebration (peak-end moment). */
export const READY_THRESHOLD = 90

export function computeTripProgress(input: TripProgressInput): TripProgress {
  // Transport only becomes relevant once there's a destination. A single-city
  // trip needs none (auto-done); a multi-city trip needs a mode set. A trip with
  // no destinations yet leaves it incomplete rather than inflating the head-start.
  const transportDone =
    input.destinationCount >= 1 && (input.destinationCount < 2 || input.transportSet >= 1)

  const steps: ProgressStep[] = [
    {
      key: 'start',
      labelKey: 'progress.step.start',
      weight: 15, // endowed head-start — granted the moment a trip exists
      done: input.started,
      tab: 'route',
    },
    {
      key: 'destinations',
      labelKey: 'progress.step.destinations',
      weight: 20,
      done: input.destinationCount >= 1,
      tab: 'route',
    },
    {
      key: 'dates',
      labelKey: 'progress.step.dates',
      weight: 15,
      done: input.hasTripDates || input.datedDestinations >= 1,
      tab: 'route',
    },
    {
      key: 'stops',
      labelKey: 'progress.step.stops',
      weight: 25, // the core build — planning what to do each day
      done: input.scheduledPlaces >= 1,
      tab: 'itinerary',
    },
    {
      key: 'transport',
      labelKey: 'progress.step.transport',
      weight: 10,
      done: transportDone,
      tab: 'route',
    },
    {
      key: 'budget',
      labelKey: 'progress.step.budget',
      weight: 10,
      done: input.budgetEntries >= 1 || input.pricedPlaces >= 1,
      tab: 'budget',
    },
    {
      key: 'packing',
      labelKey: 'progress.step.packing',
      weight: 5,
      done: input.packingItems >= 1,
      tab: 'packing',
    },
  ]

  const earned = steps.reduce((sum, s) => sum + (s.done ? s.weight : 0), 0)
  const percent = Math.round(earned)
  const nextStep = steps.find((s) => !s.done) ?? null

  return {
    percent,
    steps,
    nextStep,
    complete: nextStep === null,
    ready: percent >= READY_THRESHOLD,
  }
}
