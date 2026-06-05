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

const SUPPORTED: Lang[] = [
  'he', 'en', 'es', 'fr', 'de', 'it', 'pt', 'ar', 'zh', 'ja', 'ru', 'hi',
  'ko', 'tr', 'pl', 'nl', 'id', 'vi',
]

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem('lang') as Lang | null
    if (stored && SUPPORTED.includes(stored)) return stored
  } catch {
    /* ignore */
  }
  return 'he'
}

// BCP-47 locale for Intl (dates, currency). Default region per language.
const LOCALES: Record<Lang, string> = {
  he: 'he-IL',
  en: 'en',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
  ar: 'ar',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ru: 'ru-RU',
  hi: 'hi-IN',
  ko: 'ko-KR',
  tr: 'tr-TR',
  pl: 'pl-PL',
  nl: 'nl-NL',
  id: 'id-ID',
  vi: 'vi-VN',
}

const RTL_LANGS: Lang[] = ['he', 'ar']

function applyDocumentLang(lang: Lang) {
  document.documentElement.lang = lang
  document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr'
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

  const locale = LOCALES[lang] ?? 'en'

  return <I18nContext.Provider value={{ lang, setLang, t, locale }}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within an I18nProvider')
  return ctx
}
