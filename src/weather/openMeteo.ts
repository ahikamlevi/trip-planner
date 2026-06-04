// Per-day weather via Open-Meteo — keyless, no API key, free for non-commercial use.
// Two modes, picked automatically per date:
//  • FORECAST  (today … +15d) — the real daily forecast.        [forecast API]
//  • NORMAL    (everything else, i.e. planning ahead / past) —   [archive API]
//    "typical for this time of year", averaged from the last N years of history.
import { useEffect, useState } from 'react'
import { addDays, today } from '../itinerary/dates'

export interface DayWeather {
  kind: 'forecast' | 'normal'
  tMax: number
  tMin: number
  code?: number // WMO weather code — forecast only
  precipMm?: number // avg daily precipitation — normal only
}

export interface WeatherEntry {
  date: string
  lat: number
  lng: number
}

// How many recent full years to average for a climate "normal".
const CLIMATE_YEARS = 10

// WMO weather-code → emoji + i18n key (grouped into a handful of buckets).
const META: { codes: number[]; emoji: string; key: string }[] = [
  { codes: [0], emoji: '☀️', key: 'clear' },
  { codes: [1], emoji: '🌤️', key: 'mostlyClear' },
  { codes: [2], emoji: '⛅', key: 'partlyCloudy' },
  { codes: [3], emoji: '☁️', key: 'overcast' },
  { codes: [45, 48], emoji: '🌫️', key: 'fog' },
  { codes: [51, 53, 55, 56, 57], emoji: '🌦️', key: 'drizzle' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], emoji: '🌧️', key: 'rain' },
  { codes: [71, 73, 75, 77, 85, 86], emoji: '🌨️', key: 'snow' },
  { codes: [95, 96, 99], emoji: '⛈️', key: 'thunder' },
]

export function weatherMeta(code: number): { emoji: string; key: string } {
  return META.find((m) => m.codes.includes(code)) ?? { emoji: '🌡️', key: 'unknown' }
}

// Rough emoji for a climate normal, from its average daily rainfall.
export function normalEmoji(precipMm: number): string {
  return precipMm >= 6 ? '🌧️' : precipMm >= 2 ? '🌦️' : precipMm >= 0.3 ? '⛅' : '☀️'
}

const round = (n: number) => Math.round(n * 100) / 100
const coordKey = (lat: number, lng: number) => `${round(lat)},${round(lng)}`
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

// Module-level caches so switching tabs / re-rendering doesn't refetch.
const forecastCache = new Map<string, Record<string, DayWeather>>()
const climateCache = new Map<string, Map<string, DayWeather>>() // coord -> ("MM-DD" -> normal)

async function fetchForecast(
  lat: number,
  lng: number,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<Record<string, DayWeather>> {
  const ck = `${coordKey(lat, lng)}|${start}|${end}`
  const hit = forecastCache.get(ck)
  if (hit) return hit
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto` +
    `&start_date=${start}&end_date=${end}`
  const res = await fetch(url, { signal })
  if (!res.ok) return {}
  const d = await res.json()
  const time: string[] = d.daily?.time ?? []
  const out: Record<string, DayWeather> = {}
  for (let i = 0; i < time.length; i++) {
    const tMax = d.daily?.temperature_2m_max?.[i]
    const tMin = d.daily?.temperature_2m_min?.[i]
    if (tMax == null || tMin == null) continue
    out[time[i]] = { kind: 'forecast', code: d.daily?.weather_code?.[i] ?? 0, tMax: Math.round(tMax), tMin: Math.round(tMin) }
  }
  forecastCache.set(ck, out)
  return out
}

// One archive call per location covering the last CLIMATE_YEARS full years; average
// per calendar day ("MM-DD") to get a climate normal usable for any planning date.
async function fetchClimate(lat: number, lng: number, signal?: AbortSignal): Promise<Map<string, DayWeather>> {
  const ck = coordKey(lat, lng)
  const hit = climateCache.get(ck)
  if (hit) return hit
  const thisYear = new Date().getFullYear()
  const start = `${thisYear - CLIMATE_YEARS}-01-01`
  const end = `${thisYear - 1}-12-31`
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto` +
    `&start_date=${start}&end_date=${end}`
  const res = await fetch(url, { signal })
  if (!res.ok) return new Map()
  const d = await res.json()
  const time: string[] = d.daily?.time ?? []
  const acc = new Map<string, { tMax: number[]; tMin: number[]; precip: number[] }>()
  for (let i = 0; i < time.length; i++) {
    const md = time[i].slice(5) // "MM-DD"
    const a = acc.get(md) ?? { tMax: [], tMin: [], precip: [] }
    const mx = d.daily?.temperature_2m_max?.[i]
    const mn = d.daily?.temperature_2m_min?.[i]
    const pr = d.daily?.precipitation_sum?.[i]
    if (mx != null) a.tMax.push(mx)
    if (mn != null) a.tMin.push(mn)
    if (pr != null) a.precip.push(pr)
    acc.set(md, a)
  }
  const out = new Map<string, DayWeather>()
  for (const [md, a] of acc) {
    if (!a.tMax.length) continue
    out.set(md, {
      kind: 'normal',
      tMax: Math.round(mean(a.tMax)),
      tMin: Math.round(mean(a.tMin)),
      precipMm: Math.round(mean(a.precip) * 10) / 10,
    })
  }
  climateCache.set(ck, out)
  return out
}

// Returns date → weather for the given itinerary days: a real forecast for the next
// ~16 days, a climate normal ("typical for this time of year") for anything else, so
// planning months ahead still shows useful guidance. Best-effort: never throws.
export function useTripWeather(entries: WeatherEntry[]): Map<string, DayWeather> {
  const [map, setMap] = useState<Map<string, DayWeather>>(new Map())
  // Only refetch when the (date, rounded-coord) set actually changes.
  const sig = entries
    .map((e) => `${e.date}@${coordKey(e.lat, e.lng)}`)
    .sort()
    .join('|')

  useEffect(() => {
    if (entries.length === 0) {
      setMap(new Map())
      return
    }
    const windowStart = today()
    const windowEnd = addDays(windowStart, 15)
    const forecastGroups = new Map<string, { lat: number; lng: number; dates: string[] }>()
    const climateGroups = new Map<string, { lat: number; lng: number; dates: string[] }>()
    for (const e of entries) {
      const inWindow = e.date >= windowStart && e.date <= windowEnd
      const target = inWindow ? forecastGroups : climateGroups
      const key = coordKey(e.lat, e.lng)
      const g = target.get(key) ?? { lat: e.lat, lng: e.lng, dates: [] }
      g.dates.push(e.date)
      target.set(key, g)
    }

    const controller = new AbortController()
    void (async () => {
      const result = new Map<string, DayWeather>()
      for (const g of forecastGroups.values()) {
        const sorted = g.dates.slice().sort()
        try {
          const data = await fetchForecast(g.lat, g.lng, sorted[0], sorted[sorted.length - 1], controller.signal)
          for (const date of g.dates) if (data[date]) result.set(date, data[date])
        } catch {
          /* best-effort */
        }
      }
      for (const g of climateGroups.values()) {
        try {
          const normals = await fetchClimate(g.lat, g.lng, controller.signal)
          for (const date of g.dates) {
            const n = normals.get(date.slice(5))
            if (n) result.set(date, n)
          }
        } catch {
          /* best-effort */
        }
      }
      if (!controller.signal.aborted) setMap(result)
    })()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  return map
}
