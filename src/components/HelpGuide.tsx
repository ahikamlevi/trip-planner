// "How it works" guide — a static, scrollable reference of the main features, opened from
// the account ⚙️ menu. Content is data-driven so it stays in sync with the empty-tip copy
// and is easy to translate (each section is two i18n keys).
import { Link } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider'

const SECTIONS: { emoji: string; key: string }[] = [
  { emoji: '📍', key: 'places' },
  { emoji: '🗓️', key: 'itinerary' },
  { emoji: '🧭', key: 'discover' },
  { emoji: '💰', key: 'budget' },
  { emoji: '🎒', key: 'packing' },
  { emoji: '🥗', key: 'dietary' },
  { emoji: '👥', key: 'share' },
]

export function HelpGuide({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{t('help.title')}</strong>
          <button className="linklike" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <p className="muted small">{t('help.intro')}</p>
        <ul className="help-list">
          {SECTIONS.map((s) => (
            <li key={s.key} className="help-item">
              <span className="help-emoji" aria-hidden="true">
                {s.emoji}
              </span>
              <div>
                <p className="help-item-title">{t(`help.${s.key}.t`)}</p>
                <p className="muted small">{t(`help.${s.key}.b`)}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="help-footer">
          <Link to="/legal" className="muted small" onClick={onClose}>
            {t('legal.link')}
          </Link>
        </p>
      </div>
    </div>
  )
}
