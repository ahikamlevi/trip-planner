// All dates are stored as 'YYYY-MM-DD' strings (Postgres date). We treat them as
// plain calendar dates with no timezone — string math only, to avoid UTC drift.

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export function dateRange(start: string, end: string): string[] {
  if (!start || !end || end < start) return []
  const out: string[] = []
  let cur = start
  // Cap to a sane maximum so a typo can't generate thousands of rows.
  for (let i = 0; i < 366 && cur <= end; i++) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `${WEEKDAYS[dt.getUTCDay()]} ${MONTHS[m - 1]} ${d}`
}

export function formatMonthDay(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

export function monthName(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

export function dayOfMonth(isoDate: string): number {
  return Number(isoDate.slice(8, 10))
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addMonths(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCMonth(dt.getUTCMonth() + n)
  return dt.toISOString().slice(0, 10)
}

// weekStartsOn: 0 = Sunday, 1 = Monday.
export function startOfWeek(isoDate: string, weekStartsOn = 1): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const diff = (dt.getUTCDay() - weekStartsOn + 7) % 7
  return addDays(isoDate, -diff)
}

export function weekDates(isoDate: string, weekStartsOn = 1): string[] {
  const start = startOfWeek(isoDate, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

// 6 weeks (42 cells) always fully cover a calendar month.
export function monthGrid(isoDate: string, weekStartsOn = 1): string[] {
  const first = `${isoDate.slice(0, 7)}-01`
  const gridStart = startOfWeek(first, weekStartsOn)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

export function weekdayHeaders(weekStartsOn = 1): string[] {
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[(weekStartsOn + i) % 7])
}
