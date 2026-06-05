import { useNavigate } from 'react-router'
import { useLanguage } from '../contexts/LanguageContext'
import type { Lang } from '../i18n/translations'
import { useState } from 'react';

const LANGUAGES: { code: Lang; flag: string; name: string; region: string }[] = [
  { code: 'en', flag: '🇺🇸', name: 'English', region: 'United States' },
  { code: 'ru', flag: '🇷🇺', name: 'Russian (русский)', region: 'Россия' },
]

const Languages = () => {
  const navigate = useNavigate()
  const { lang, setLang, t } = useLanguage()

  const [activeLang, setActiveLang] = useState(lang)

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

      <div className="flex flex-col gap-4 bg-[#F5F7FB] py-5 px-3 rounded-2xl">
        <div className='flex justify-between mb-2'>
          <p>Available Language’s</p>
          <p>02 Selected</p>
        </div>
        {LANGUAGES.map((l) => {
          const active = lang === l.code
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => setActiveLang(l.code)}
              className={`flex items-center gap-4 w-full text-left px-4 py-3 rounded-xl border transition-all ${active
                  ? 'border-[#6B6AFD] bg-[#6B6AFD0D]'
                  : 'border-[#666F8B33] bg-transparent hover:bg-[#F5F7FB]'
                }`}
            >
              
              <div className="flex-1">
                <p className={` ${active ? 'text-[#6B6AFD]' : 'text-[#666F8B]'}`}>
                  {l.name}
                </p>
              </div>
              <div className={`w-4 h-4 rounded-full flex justify-center items-center border ${active ? "border-[#6B6AFD]" : "border-[#666F8B99]"} `}>
                <div className={`${active ? "bg-[#6B6AFD]" : "bg-[#666F8B66]"} rounded-full w-2.5 h-2.5`}></div>  
              </div>
            </button>
          )
        })}
      </div>

      <div className='bg-[#DA09090D] mx-3 p-3 rounded-xl mt-8'>
        <p className='font-medium text-xs text-[#DA0909]'>Disclaimer</p>
        <p className='pt-3 font-light text-xs text-[#DA0909]'>Changes will apply immediately to all navigation labels, product descriptions, and notifications.</p>
      </div>

      <button onClick={() => setLang(activeLang)} className='bg-[#6B6AFD] mx-3 w-[95%] mt-8 h-[45px] text-white text-sm rounded-lg'>Save Changes</button>
    </div>
  )
}

export default Languages
