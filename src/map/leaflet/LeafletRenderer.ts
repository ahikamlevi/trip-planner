import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapMarker, MapRenderer, MapRendererOptions } from '../MapRenderer'
import { categoryMeta } from '../../places/categories'

function pinIcon(marker: MapMarker): L.DivIcon {
  const { color } = categoryMeta(marker.category)
  const hasBadge = marker.badge != null
  const size = marker.selected ? 28 : hasBadge ? 24 : 18
  const ring = marker.selected ? 'box-shadow:0 0 0 4px rgba(59,130,246,.45);' : ''
  const inner = hasBadge
    ? `<span style="color:#fff;font-size:12px;font-weight:700;line-height:1">${marker.badge}</span>`
    : ''
  return L.divIcon({
    className: 'map-pin',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:${color};border:2px solid #fff;border-radius:50%;${ring}">${inner}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export function createLeafletRenderer(opts: MapRendererOptions): MapRenderer {
  const map = L.map(opts.container).setView([opts.center.lat, opts.center.lng], opts.zoom)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)

  if (opts.onMapClick) {
    map.on('click', (e: L.LeafletMouseEvent) =>
      opts.onMapClick!({ lat: e.latlng.lat, lng: e.latlng.lng }),
    )
  }

  // Containers often size after mount (flex/grid); recompute once tiles settle.
  setTimeout(() => map.invalidateSize(), 0)

  const layer = L.layerGroup().addTo(map)
  let pathLine: L.Polyline | null = null

  return {
    setMarkers(markers: MapMarker[]) {
      layer.clearLayers()
      for (const m of markers) {
        const marker = L.marker([m.position.lat, m.position.lng], { icon: pinIcon(m) })
        if (m.popup) marker.bindPopup(m.popup)
        if (m.label) marker.bindTooltip(m.label, { direction: 'top', offset: [0, -8] })
        marker.on('click', () => opts.onMarkerClick?.(m.id))
        marker.addTo(layer)
      }
    },
    setPath(points) {
      if (pathLine) {
        pathLine.remove()
        pathLine = null
      }
      if (points.length >= 2) {
        pathLine = L.polyline(
          points.map((p) => [p.lat, p.lng] as [number, number]),
          { color: '#3b82f6', weight: 3, opacity: 0.7, dashArray: '6 7' },
        ).addTo(map)
      }
    },
    setView(center, zoom) {
      map.setView([center.lat, center.lng], zoom ?? map.getZoom())
    },
    fitToMarkers(markers) {
      if (markers.length === 0) return
      const bounds = L.latLngBounds(markers.map((m) => [m.position.lat, m.position.lng]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    },
    destroy() {
      map.remove()
    },
  }
}
