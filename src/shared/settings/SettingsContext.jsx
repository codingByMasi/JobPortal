// Gives every screen the site settings (WhatsApp, UPI, emails, company name, site address) that the admin saved in the app.
// While they load, or when a setting is not filled in yet, `has(name)` is false so a screen can hide the button instead of showing an example value.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, isDemo } from '../data';
import { DEFAULT_SETTINGS, isFilledIn, mergeSettings } from '../lib/siteSettings';

const SettingsContext = createContext(null);
const EMPTY = mergeSettings([]);

/** Wrap the app once. In demo mode the example values count as filled in. */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(isDemo ? DEFAULT_SETTINGS : EMPTY);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      setSettings(mergeSettings(await api.getSiteSettings()));
    } catch {
      /* the screens keep working; the buttons that need a setting stay hidden */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
    // the payee details are readable only after login, so read again when the person logs in or out
    return api.onAuthChange?.(() => { reload(); });
  }, [reload]);

  const value = useMemo(() => ({ settings, ready, reload, has: (name) => isFilledIn(name, settings[name], isDemo) }), [settings, ready, reload]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** { settings, ready, has(name), reload() }. */
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings needs SettingsProvider');
  return ctx;
}
