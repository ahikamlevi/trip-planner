import { useEffect, useRef } from 'react'
import { createMapRenderer, type LatLng, type MapBounds, type MapMarker, type MapRenderer } from './index'
import { useT } from '../i18n/I18nProvider'

/** Small imperative handle the parent can hold to read map state on demand. */
export interface MapApi {
  getBounds: () => MapBounds | null
}

interface MapViewProps {
  center: LatLng
  zoom?: number
  markers: MapMarker[]
  /** Optional polyline drawn through these points (e.g. a day's stop order). */
  path?: LatLng[]
  /** When this changes to a non-null value, the map recenters on it. */
  focus?: LatLng | null
  /** When this value changes, re-fit the map to all current markers (opt-in; default keeps
   *  the fit-once behaviour). Used by the Route map so adding cities reframes the journey. */
  fitKey?: string | number
  onMapClick?: (pos: LatLng) => void
  onMarkerClick?: (id: string) => void
  /** Called once the map is created, handing back an imperative API. */
  onReady?: (api: MapApi) => void
}

export function MapView({ center, zoom = 12, markers, path, focus, fitKey, onMapClick, onMarkerClick, onReady }: MapViewProps) {
  const { t } = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<MapRenderer | null>(null)
  const didFit = useRef(false)
  const markersRef = useRef(markers)
  markersRef.current = markers
  const firstFitKey = useRef(true)

  // Keep callbacks fresh without recreating the map.
  const onMapClickRef = useRef(onMapClick)
  const onMarkerClickRef = useRef(onMarkerClick)
  const onReadyRef = useRef(onReady)
  onMapClickRef.current = onMapClick
  onMarkerClickRef.current = onMarkerClick
  onReadyRef.current = onReady

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const renderer = createMapRenderer({
      container,
      center,
      zoom,
      onMapClick: (pos) => onMapClickRef.current?.(pos),
      onMarkerClick: (id) => onMarkerClickRef.current?.(id),
    })
    rendererRef.current = renderer
    onReadyRef.current?.({ getBounds: () => renderer.getBounds() })

    // When the container changes size (responsive reflow, a resize/expand toggle,
    // orientation change), Leaflet must re-measure or it leaves gray tile gaps.
    // Debounce to a single rAF so a burst of resize events does one invalidate.
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => renderer.invalidateSize())
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
      renderer.destroy()
      rendererRef.current = null
      didFit.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push markers; fit to them the first time any appear.
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setMarkers(markers)
    if (!didFit.current && markers.length > 0) {
      r.fitToMarkers(markers)
      didFit.current = true
    }
  }, [markers])

  // Update the route path.
  useEffect(() => {
    rendererRef.current?.setPath(path ?? [])
  }, [path])

  // Re-fit to all markers when fitKey changes (skip the very first render — the markers
  // effect already fits once on initial load).
  useEffect(() => {
    if (fitKey === undefined) return
    if (firstFitKey.current) {
      firstFitKey.current = false
      return
    }
    const r = rendererRef.current
    if (r && markersRef.current.length) r.fitToMarkers(markersRef.current)
  }, [fitKey])

  // Recenter when a focus target is set.
  useEffect(() => {
    if (focus && rendererRef.current) {
      // Zoom in to at least 16 (clear neighborhood view); never zoom out (renderer
      // keeps the larger of this and the current zoom).
      rendererRef.current.setView(focus, 16)
    }
  }, [focus])

  return <div ref={containerRef} className="map" role="application" aria-label={t('a11y.map')} />
}
