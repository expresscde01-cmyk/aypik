import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '../locales/fr.json' with { type: 'json' };
import en from '../locales/en.json' with { type: 'json' };
import es from '../locales/es.json' with { type: 'json' };
import { DEFAULT_LOCALE } from './locales';

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    es: { translation: es },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: ['fr', 'en', 'es'],
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
  react: {
    useSuspense: false,
  },
});

export default i18n;
