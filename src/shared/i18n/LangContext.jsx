// Holds the chosen language (remembered in localStorage) and gives screens the text for it.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES, translations } from '.';
import { pickLang } from './pickLang';

const KEY = 'jobs-abroad-lang';
const LangContext = createContext(null);

function savedLang() {
  try {
    return pickLang(localStorage.getItem(KEY), navigator.languages);
  } catch {
    return pickLang(null, typeof navigator === 'undefined' ? [] : navigator.languages);
  }
}

/** Wraps the app so every screen can read `t` (text), call `toggle` (English and Hindi) or `setLang` (any language). */
export function LangProvider({ children }) {
  const [lang, setLang] = useState(savedLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = LANGUAGES.find((l) => l.code === lang)?.dir || 'ltr';
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* private mode: choice is just not remembered */
    }
  }, [lang]);

  const toggle = useCallback(() => setLang((l) => (l === 'en' ? 'hi' : 'en')), []);
  const value = useMemo(() => ({ lang, t: translations[lang], toggle, setLang }), [lang, toggle]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
