import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapBounds, MapMarker, MapRenderer, MapRendererOptions } from '../MapRenderer'
import { categoryMeta } from '../../places/categories'
import { activeTileLayer } from '../tiles'

// Leaflet renders string tooltip/popup content via innerHTML, so any
// user-controlled text (place names) must be escaped before it's passed in,
// or a saved place named e.g. `<img src=x onerror=…>` becomes stored XSS.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

function pinIcon(marker: MapMarker): L.DivIcon {
  const color = marker.color ?? categoryMeta(marker.category).color
  const hasBadge = marker.badge != null
  const size = marker.selected ? 28 : hasBadge ? 24 : 18
  const ring = marker.selected ? 'box-shadow:0 0 0 4px rgba(59,130,246,.45);' : ''
  const inner = hasBadge
    ? `<span style="color:#fff;font-size:12px;font-weight:700;line-height:1">${marker.badge}</span>`
    : ''
  return L.divIcon({
    className: 'map-pin',
    // The inner span carries a "drop & settle" animation (see .map-pin-dot in index.css).
    html: `<span class="map-pin-dot" style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:${color};border:2px solid #fff;border-radius:50%;${ring}">${inner}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export function createLeafletRenderer(opts: MapRendererOptions): MapRenderer {
  const map = L.map(opts.container).setView([opts.center.lat, opts.center.lng], opts.zoom)

  const tiles = activeTileLayer()
  L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: tiles.maxZoom }).addTo(map)

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
        if (m.label) marker.bindTooltip(escapeHtml(m.label), { direction: 'top', offset: [0, -8] })
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
          { color: '#2563eb', weight: 3, opacity: 0.75, dashArray: '6 7', className: 'route-line' },
        ).addTo(map)
      }
    },
    setView(center, zoom) {
      // Never zoom OUT when focusing a point — keep the user's zoom if they're
      // already closer than the requested level; otherwise zoom in to it.
      const target = zoom != null ? Math.max(zoom, map.getZoom()) : map.getZoom()
      map.setView([center.lat, center.lng], target)
    },
    fitToMarkers(markers) {
      if (markers.length === 0) return
      const bounds = L.latLngBounds(markers.map((m) => [m.position.lat, m.position.lng]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    },
    getBounds(): MapBounds {
      const b = map.getBounds()
      return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }
    },
    invalidateSize() {
      map.invalidateSize()
    },
    destroy() {
      map.remove()
    },
  }
}
