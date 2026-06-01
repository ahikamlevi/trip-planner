// The one place that picks the active map provider. Swap this line to change
// providers app-wide (e.g. to a future GoogleRenderer) — nothing else changes.
import { createLeafletRenderer } from './leaflet/LeafletRenderer'
import type { MapRendererFactory } from './MapRenderer'

export const createMapRenderer: MapRendererFactory = createLeafletRenderer
export type { LatLng, MapMarker, MapRenderer } from './MapRenderer'
