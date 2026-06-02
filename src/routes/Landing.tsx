import { Login } from '../auth/Login'
import { useT } from '../i18n/I18nProvider'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
import { useTheme } from '../theme/ThemeProvider'

// Logged-out marketing + sign-in screen. Public first impression.
export function Landing() {
  const { t } = useT()
  const { theme, toggle } = useTheme()

  const points = ['realtime', 'map', 'dietary', 'bilingual'] as const
  const features = ['itinerary', 'map', 'budget', 'dietary'] as const

  return (
    <div className="landing">
      <header className="landing-top">
        <span className="app-title">{t('appName')}</span>
        <div className="landing-top-actions">
          <button
            className="theme-toggle"
            onClick={toggle}
            title={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
            aria-label={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="landing-hero" id="main">
        <div className="landing-hero-text">
          <h1>{t('landing.title')}</h1>
          <p className="landing-sub">{t('landing.subtitle')}</p>
          <ul className="landing-points">
            {points.map((p) => (
              <li key={p}>
                <span aria-hidden="true">✓</span> {t(`landing.point.${p}`)}
              </li>
            ))}
          </ul>
        </div>
        <div className="landing-auth">
          <Login />
        </div>
      </main>

      <section className="landing-features" aria-label={t('landing.featuresTitle')}>
        <h2>{t('landing.featuresTitle')}</h2>
        <div className="landing-feature-grid">
          {features.map((f) => (
            <div className="landing-feature card" key={f}>
              <span className="landing-feature-emoji" aria-hidden="true">
                {t(`landing.feat.${f}.emoji`)}
              </span>
              <strong>{t(`landing.feat.${f}.title`)}</strong>
              <p className="muted small">{t(`landing.feat.${f}.body`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
