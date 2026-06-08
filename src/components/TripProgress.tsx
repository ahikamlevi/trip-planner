import { useT } from '../i18n/I18nProvider'
import { useCountUp } from '../lib/useCountUp'
import type { ProgressTab, TripProgress as Progress } from '../progress/tripProgress'

/**
 * The completion meter — a goal-gradient progress bar with an endowed
 * head-start and a single, clickable "next action". This is the keystone
 * retention surface: it pulls users toward a *finished* plan (which is what
 * the IKEA effect rewards) and quietly fights abandonment.
 */
export function TripProgress({
  progress,
  onGoToTab,
}: {
  progress: Progress
  onGoToTab: (tab: ProgressTab) => void
}) {
  const { t } = useT()
  const shown = Math.round(useCountUp(progress.percent))
  const { nextStep, complete, percent } = progress

  return (
    <section
      className={`trip-progress${complete ? ' is-complete' : ''}${percent >= 80 ? ' near-goal' : ''}`}
      aria-label={t('progress.aria')}
    >
      <div className="trip-progress-head">
        <span className="trip-progress-pct display">{shown}%</span>
        <span className="trip-progress-label">
          {complete ? t('progress.complete') : t('progress.planned')}
        </span>
        {!complete && nextStep && (
          <button
            type="button"
            className="trip-progress-next"
            onClick={() => onGoToTab(nextStep.tab)}
          >
            {t('progress.next', { step: t(nextStep.labelKey) })}
            <span aria-hidden="true"> →</span>
          </button>
        )}
      </div>
      <div
        className="trip-progress-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="trip-progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </section>
  )
}

/** Compact bar for Dashboard trip cards — pulls users back to unfinished trips. */
export function TripProgressBar({ percent }: { percent: number }) {
  const { t } = useT()
  const complete = percent >= 100
  return (
    <span
      className={`trip-progress-mini${complete ? ' is-complete' : ''}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={t('progress.planned')}
      title={`${percent}% · ${t('progress.planned')}`}
    >
      <span className="trip-progress-mini-fill" style={{ width: `${percent}%` }} />
    </span>
  )
}
