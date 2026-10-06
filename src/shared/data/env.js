// Which data the app uses, decided once at start-up.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
/** Public key of the optional "I am not a robot" check (Cloudflare Turnstile). Empty = no check shown. */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

/**
 * 'supabase' = real data (both keys present).
 * 'demo'     = fake data kept in the browser. Only while developing, or when VITE_ALLOW_DEMO=true is set on purpose.
 * 'blocked'  = a published site with no keys. We show a "not set up" page instead of silently showing fake ads
 *              (a typo in the hosting settings must never turn the live site into a demo).
 */
export function chooseMode({ url, key, dev, allowDemo }) {
  if (url && key) return 'supabase';
  return dev || allowDemo ? 'demo' : 'blocked';
}

export const appMode = chooseMode({
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,
  dev: Boolean(import.meta.env.DEV),
  allowDemo: import.meta.env.VITE_ALLOW_DEMO === 'true',
});
export const hasSupabase = appMode === 'supabase';
