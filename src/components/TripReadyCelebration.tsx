import { useEffect, useRef } from 'react'
import { useT } from '../i18n/I18nProvider'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Deterministic confetti — positions/colors derived from the index so there's
// no Math.random churn, while still looking scattered.
const CONFETTI_COLORS = ['#fb7185', '#f97316', '#f59e0b', '#2563eb', '#22c55e', '#a855f7']
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 9) * 90,
  duration: 2400 + (i % 6) * 320,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 7 + (i % 4) * 2,
}))

/**
 * The trip-ready celebration — the engineered "peak" (peak-end rule). It fires
 * once when a plan crosses the ready threshold, ending the planning arc on a
 * high and giving users a shareable moment of ownership over what *they* built.
 */
export function TripReadyCelebration({
  tripName,
  days,
  cities,
  stops,
  onShare,
  onClose,
}: {
  tripName: string
  days: number
  cities: number
  stops: number
  onShare: () => void
  onClose: () => void
}) {
  const { t } = useT()
  const closeRef = useRef<HTMLButtonElement>(null)
  const reduced = prefersReducedMotion()

  // Focus management + Escape to dismiss (accessible modal behaviour).
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const stats: Array<{ value: number; label: string }> = [
    { value: days, label: t('celebrate.days', { count: days }) },
    { value: cities, label: t('celebrate.cities', { count: cities }) },
    { value: stops, label: t('celebrate.stops', { count: stops }) },
  ]

  return (
    <div
      className="celebrate-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('celebrate.aria')}
      onClick={onClose}
    >
      {!reduced && (
        <div className="celebrate-confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              style={{
                left: `${c.left}%`,
                width: `${c.size}px`,
                height: `${c.size * 1.6}px`,
                background: c.color,
                animationDelay: `${c.delay}ms`,
                animationDuration: `${c.duration}ms`,
              }}
            />
          ))}
        </div>
      )}

      <div className="celebrate-card" onClick={(e) => e.stopPropagation()}>
        {/* Decorative route that draws itself, with a plane along the way. */}
        <svg className="celebrate-route" viewBox="0 0 300 90" aria-hidden="true">
          <path
            className="celebrate-route-path"
            d="M16 70 C 70 10, 120 78, 165 38 S 250 8, 284 26"
            fill="none"
            stroke="url(#celebrateGrad)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="celebrateGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="55%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          <text className="celebrate-plane" x="284" y="30">✈️</text>
        </svg>

        <h2 className="celebrate-title display">{t('celebrate.title')} ✈️</h2>
        <p className="celebrate-subtitle">{t('celebrate.subtitle', { name: tripName })}</p>

        <div className="celebrate-stats">
          {stats.map((s, i) => (
            <div key={i} className="celebrate-stat">
              <span className="celebrate-stat-value display">{s.value}</span>
              <span className="celebrate-stat-label">{s.label.replace(/^\d+\s*/, '')}</span>
            </div>
          ))}
        </div>

        <div className="celebrate-actions">
          <button type="button" onClick={onShare}>
            {t('celebrate.share')}
          </button>
          <button ref={closeRef} type="button" className="secondary" onClick={onClose}>
            {t('celebrate.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
