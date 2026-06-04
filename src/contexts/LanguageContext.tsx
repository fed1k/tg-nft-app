import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { translations, type Lang, type TranslationKey } from '../i18n/translations'

const STORAGE_KEY = 'gf_lang'

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'ru') return v
  } catch { /* ignore */ }
  return 'en'
}

interface LanguageContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)

  const setLang = useCallback((l: Lang) => {
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ }
    setLangState(l)
  }, [])

  const t = useCallback((key: TranslationKey): string => {
    return translations[lang][key] ?? translations['en'][key] ?? key
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
