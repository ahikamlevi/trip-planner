import { useEffect, useRef } from 'react'
import { createMapRenderer, type LatLng, type MapMarker, type MapRenderer } from './index'

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
}

export function MapView({ center, zoom = 12, markers, path, focus, onMapClick, onMarkerClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<MapRenderer | null>(null)
  const didFit = useRef(false)

  // Keep callbacks fresh without recreating the map.
  const onMapClickRef = useRef(onMapClick)
  const onMarkerClickRef = useRef(onMarkerClick)
  onMapClickRef.current = onMapClick
  onMarkerClickRef.current = onMarkerClick

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

  return <div ref={containerRef} className="map" />
}
