// Provider-agnostic map interface. App code talks to this; only files under
// src/map/<provider>/ know which library actually renders. Swapping Leaflet for
// Google/Mapbox later means writing one new factory, not touching the app.
import type { PlaceCategory } from '../lib/database.types'

export interface LatLng {
  lat: number
  lng: number
}

export interface MapMarker {
  id: string
  position: LatLng
  category: PlaceCategory
  label?: string
  selected?: boolean
  /** Text drawn inside the pin (e.g. a stop order number). */
  badge?: string | number
  /** HTML shown in a popup when the marker is clicked. */
  popup?: string
}

export interface MapRendererOptions {
  container: HTMLElement
  center: LatLng
  zoom: number
  onMapClick?: (pos: LatLng) => void
  onMarkerClick?: (id: string) => void
}

export interface MapRenderer {
  setMarkers(markers: MapMarker[]): void
  /** Draws a polyline through the given points (empty array clears it). */
  setPath(points: LatLng[]): void
  setView(center: LatLng, zoom?: number): void
  fitToMarkers(markers: MapMarker[]): void
  destroy(): void
}

export type MapRendererFactory = (opts: MapRendererOptions) => MapRenderer
