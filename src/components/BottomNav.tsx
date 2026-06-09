import { useT } from '../i18n/I18nProvider'

export type Tab = 'route' | 'places' | 'itinerary' | 'budget' | 'packing' | 'dietary'

/** Single source of truth for the trip sections — used by both the desktop top
 *  tabs and the mobile bottom navigation, so the two can never drift apart. */
export const TABS: { key: Tab; labelKey: string; icon: string }[] = [
  { key: 'route', labelKey: 'tab.route', icon: '🧭' },
  { key: 'places', labelKey: 'tab.places', icon: '📍' },
  { key: 'itinerary', labelKey: 'tab.itinerary', icon: '🗓️' },
  { key: 'budget', labelKey: 'tab.budget', icon: '💰' },
  { key: 'packing', labelKey: 'tab.packing', icon: '🧳' },
  { key: 'dietary', labelKey: 'tab.dietary', icon: '🍽️' },
]

/**
 * Fixed bottom tab bar — the mobile navigation. Thumb-reachable, always visible
 * (nothing hidden off-screen like the scrolling top tabs), with large tap
 * targets. Phone-only; hidden at >=641px via CSS where the top tabs take over.
 */
export function BottomNav({ tab, onSelect }: { tab: Tab; onSelect: (t: Tab) => void }) {
  const { t } = useT()
  return (
    <nav className="bottom-nav" aria-label={t('tab.sections')}>
      {TABS.map((s) => (
        <button
          key={s.key}
          type="button"
          className={`bottom-nav-item${tab === s.key ? ' active' : ''}`}
          aria-current={tab === s.key ? 'page' : undefined}
          onClick={() => onSelect(s.key)}
        >
          <span className="bottom-nav-icon" aria-hidden="true">{s.icon}</span>
          <span className="bottom-nav-label">{t(s.labelKey)}</span>
        </button>
      ))}
    </nav>
  )
}
