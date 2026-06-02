import { useT } from './I18nProvider'
import { LANGUAGES, type Lang } from './strings'

export function LanguageSwitcher() {
  const { lang, setLang, t } = useT()
  return (
    <select
      className="lang-switcher"
      aria-label={t('a11y.language')}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  )
}
