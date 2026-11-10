import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en/common.json'
import am from './locales/am/common.json'

export const SUPPORTED_LANGUAGES = ['en', 'am'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem('lang')
    if (saved === 'en' || saved === 'am') return saved
  } catch {
    /* storage unavailable */
  }
  return 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    am: { common: am }, // Amharic: empty for now, falls back to English per key.
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes
})

export default i18n
