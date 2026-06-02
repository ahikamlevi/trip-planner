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
  onMapClick?: (pos: LatLng) => void
  onMarkerClick?: (id: string) => void
  /** Called once the map is created, handing back an imperative API. */
  onReady?: (api: MapApi) => void
}

export function MapView({ center, zoom = 12, markers, path, focus, onMapClick, onMarkerClick, onReady }: MapViewProps) {
  const { t } = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<MapRenderer | null>(null)
  const didFit = useRef(false)

  // Keep callbacks fresh without recreating the map.
  const onMapClickRef = useRef(onMapClick)
  const onMarkerClickRef = useRef(onMarkerClick)
  const onReadyRef = useRef(onReady)
  onMapClickRef.current = onMapClick
  onMarkerClickRef.current = onMarkerClick
  onReadyRef.current = onReady

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return
    const renderer = createMapRenderer({
      container: containerRef.current,
      center,
      zoom,
      onMapClick: (pos) => onMapClickRef.current?.(pos),
      onMarkerClick: (id) => onMarkerClickRef.current?.(id),
    })
    rendererRef.current = renderer
    onReadyRef.current?.({ getBounds: () => renderer.getBounds() })
    return () => {
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

  // Recenter when a focus target is set.
  useEffect(() => {
    if (focus && rendererRef.current) {
      rendererRef.current.setView(focus, 15)
    }
  }, [focus])

  return <div ref={containerRef} className="map" role="application" aria-label={t('a11y.map')} />
}
