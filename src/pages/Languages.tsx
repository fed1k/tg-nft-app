import { useNavigate } from 'react-router'
import { useLanguage } from '../contexts/LanguageContext'
import type { Lang } from '../i18n/translations'

const LANGUAGES: { code: Lang; flag: string; name: string; region: string }[] = [
  { code: 'en', flag: '🇺🇸', name: 'English', region: 'United States' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский', region: 'Россия' },
]

const Languages = () => {
  const navigate = useNavigate()
  const { lang, setLang, t } = useLanguage()

  return (
    <div className="px-3 pb-28 pt-12">
      <div className="flex items-center gap-3 pt-2 pb-6 relative justify-center">
        <button
          type="button"
          onClick={() => navigate('/app/profile')}
          className="p-1 absolute left-3"
          aria-label={t('common.back')}
        >
          <img className="w-6 h-6" src="/arrow-left.svg" alt="" />
        </button>
        <h1 className="text-lg font-medium text-[#0E0636]">{t('lang.title')}</h1>
      </div>

      <p className="text-sm text-[#666F8B] mb-6 pl-1">{t('lang.subtitle')}</p>

      <div className="flex flex-col gap-3">
        {LANGUAGES.map((l) => {
          const active = lang === l.code
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={`flex items-center gap-4 w-full text-left px-4 py-4 rounded-2xl border transition-all ${
                active
                  ? 'border-[#6B6AFD] bg-[#6B6AFD0D]'
                  : 'border-[#666F8B33] bg-white hover:bg-[#F5F7FB]'
              }`}
            >
              <span className="text-3xl leading-none">{l.flag}</span>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${active ? 'text-[#6B6AFD]' : 'text-[#0E0636]'}`}>
                  {l.name}
                </p>
                <p className="text-[10px] text-[#666F8B] pt-0.5">{l.region}</p>
              </div>
              {active && (
                <div className="w-5 h-5 rounded-full bg-[#6B6AFD] flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default Languages
