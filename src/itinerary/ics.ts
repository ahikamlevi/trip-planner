// Minimal iCalendar (.ics) generation for itinerary reminders. The user's phone
// calendar/clock delivers the alerts (reliable, offline, works when the app is
// closed) — we just hand it events with VALARMs.

export interface IcsEvent {
  date: string // YYYY-MM-DD (the day)
  time: string // HH:MM (arrival time)
  durationMin?: number | null
  reminderMin?: number | null // minutes before start to alert; null = no alarm
  title: string
  location?: string | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Floating local time (no TZ) so the event shows at the wall-clock time the user
// typed, regardless of the device's timezone. Format: YYYYMMDDTHHMMSS
function dtLocal(date: string, time: string): string {
  const [y, m, d] = date.split('-')
  const [hh, mm] = time.split(':')
  return `${y}${m}${d}T${pad(Number(hh))}${pad(Number(mm))}00`
}

function dtStampUTC(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  )
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function buildICS(events: IcsEvent[], calName: string, now: Date = new Date()): string {
  const stamp = dtStampUTC(now)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trip Planner//Itinerary//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
  ]

  events.forEach((ev, i) => {
    const dur = ev.durationMin && ev.durationMin > 0 ? ev.durationMin : 60
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:tripplanner-${ev.date}-${ev.time.replace(':', '')}-${i}@trip-planner`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART:${dtLocal(ev.date, ev.time)}`)
    lines.push(`DURATION:PT${dur}M`)
    lines.push(`SUMMARY:${esc(ev.title)}`)
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`)
    if (ev.reminderMin != null && ev.reminderMin >= 0) {
      lines.push('BEGIN:VALARM')
      lines.push('ACTION:DISPLAY')
      lines.push(`DESCRIPTION:${esc(ev.title)}`)
      lines.push(`TRIGGER:-PT${ev.reminderMin}M`)
      lines.push('END:VALARM')
    }
    lines.push('END:VEVENT')
  })

  lines.push('END:VCALENDAR')
  // RFC 5545 wants CRLF line endings.
  return lines.join('\r\n')
}

export function downloadICS(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
