// Holds the chosen language (remembered in localStorage) and gives screens the text for it.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translations } from '.';

const KEY = 'jobs-abroad-lang';
const LangContext = createContext(null);

function savedLang() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'hi' || v === 'en' ? v : 'en';
  } catch {
    return 'en';
  }
}

/** Wraps the app so every screen can read `t` (text) and call `toggle`. */
export function LangProvider({ children }) {
  const [lang, setLang] = useState(savedLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* private mode: choice is just not remembered */
    }
  }, [lang]);

  const toggle = useCallback(() => setLang((l) => (l === 'en' ? 'hi' : 'en')), []);
  const value = useMemo(() => ({ lang, t: translations[lang], toggle }), [lang, toggle]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
