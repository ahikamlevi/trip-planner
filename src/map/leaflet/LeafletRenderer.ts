import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapMarker, MapRenderer, MapRendererOptions } from '../MapRenderer'
import { categoryMeta } from '../../places/categories'

function pinIcon(marker: MapMarker): L.DivIcon {
  const { color } = categoryMeta(marker.category)
  const size = marker.selected ? 26 : 18
  const ring = marker.selected ? 'box-shadow:0 0 0 4px rgba(59,130,246,.45);' : ''
  return L.divIcon({
    className: 'map-pin',
    html: `<span style="display:block;width:${size}px;height:${size}px;background:${color};border:2px solid #fff;border-radius:50%;${ring}"></span>`,
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

  return {
    setMarkers(markers: MapMarker[]) {
      layer.clearLayers()
      for (const m of markers) {
        const marker = L.marker([m.position.lat, m.position.lng], { icon: pinIcon(m) })
        if (m.label) marker.bindTooltip(m.label, { direction: 'top', offset: [0, -8] })
        marker.on('click', () => opts.onMarkerClick?.(m.id))
        marker.addTo(layer)
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
