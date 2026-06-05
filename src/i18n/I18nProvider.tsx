import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { DICTS, type Lang } from './strings'

interface I18nState {
  lang: Lang
  setLang: (l: Lang) => void
  /** Translate a key, with optional {placeholder} interpolation. */
  t: (key: string, vars?: Record<string, string | number>) => string
  /** BCP-47 locale for Intl APIs (dates, currency). */
  locale: string
}

const I18nContext = createContext<I18nState | undefined>(undefined)

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem('lang')
    if (stored === 'en' || stored === 'he' || stored === 'es') return stored
  } catch {
    /* ignore */
  }
  return 'he'
}

function applyDocumentLang(lang: Lang) {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    applyDocumentLang(lang)
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem('lang', l)
    } catch {
      /* ignore */
    }
    setLangState(l)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = DICTS[lang][key] ?? DICTS.en[key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }
      return str
    },
    [lang],
  )

  const locale = lang === 'he' ? 'he-IL' : lang === 'es' ? 'es-ES' : 'en'

  return <I18nContext.Provider value={{ lang, setLang, t, locale }}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within an I18nProvider')
  return ctx
}
