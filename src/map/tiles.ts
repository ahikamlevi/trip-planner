// Active map-tile source. Uses Stadia Maps when VITE_STADIA_API_KEY is set
// (production-licensed, nicer styles, theme-matched), and falls back to the public
// OpenStreetMap tiles otherwise so the app still works without a key.
//
// Stadia's free tier suits evaluation / non-commercial use; a public commercial
// launch needs a paid plan. Restrict the key to your domains in the Stadia dashboard
// (it's exposed in the browser, which is expected for tile keys).
export interface TileConfig {
  url: string
  attribution: string
  maxZoom: number
}

export function activeTileLayer(): TileConfig {
  const key = import.meta.env.VITE_STADIA_API_KEY
  if (key) {
    // Always the bright classic-OSM style (white land, blue water), regardless of the
    // app's light/dark theme — keeps it familiar and avoids re-downloading tiles on
    // theme switches.
    return {
      url: `https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png?api_key=${key}`,
      attribution:
        '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> ' +
        '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 20,
    }
  }
  return {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }
}
