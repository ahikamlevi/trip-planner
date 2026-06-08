import { useT } from '../i18n/I18nProvider'

/**
 * First-run onboarding — replaces the static welcome list with a guided path to
 * a *finished* mini-plan. The IKEA effect only rewards completion, so the goal
 * here is momentum: three concrete steps, and an endowed head-start preview
 * (the first step pre-checked) so progress feels achievable before they begin.
 */
export function FirstRunGuide({ onStart }: { onStart: () => void }) {
  const { t } = useT()

  const steps = [
    { emoji: '📍', label: t('onboard.step1') },
    { emoji: '🗓️', label: t('onboard.step2') },
    { emoji: '✨', label: t('onboard.step3') },
  ]

  return (
    <div className="first-run">
      <span className="first-run-emoji" aria-hidden="true">🧳</span>
      <h2 className="first-run-title display">{t('onboard.title')}</h2>
      <p className="first-run-subtitle">{t('onboard.subtitle')}</p>

      {/* Endowed head-start preview — you're already on your way. */}
      <div className="first-run-progress" aria-hidden="true">
        <span className="first-run-progress-fill" style={{ width: '15%' }} />
      </div>

      <ol className="first-run-steps">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="first-run-step-num" aria-hidden="true">{i + 1}</span>
            <span className="first-run-step-emoji" aria-hidden="true">{s.emoji}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      <button className="first-run-cta" onClick={onStart}>
        {t('onboard.start')} <span aria-hidden="true">→</span>
      </button>
    </div>
  )
}
