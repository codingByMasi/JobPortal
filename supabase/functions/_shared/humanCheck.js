// The human check: asks Cloudflare Turnstile whether a visitor passed, and if so hands out a one-time pass (see migration 0036). Plain JS, no imports.

export const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** CORS headers: only our own website may call this from a browser. No site address set = no browser may. */
export function corsFor(origin, siteUrl) {
  const site = String(siteUrl || '').replace(/\/$/, '');
  const base = { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info', Vary: 'Origin' };
  return site && origin === site ? { ...base, 'Access-Control-Allow-Origin': site } : base;
}

/**
 * { status, body } for one visitor's token. deps: { env: { TURNSTILE_SECRET_KEY }, fetchFn, insertPass() -> the new pass id }.
 * The pass is created only after Cloudflare said yes. Nothing about the visitor is kept.
 */
export async function verifyHuman(token, { env, fetchFn, insertPass }) {
  if (!env.TURNSTILE_SECRET_KEY) return { status: 503, body: { error: 'not_configured' } };
  if (typeof token !== 'string' || token.length < 1 || token.length > 2048) return { status: 400, body: { error: 'token' } };
  let answer;
  try {
    const res = await fetchFn(SITEVERIFY, { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }) });
    answer = await res.json();
  } catch {
    return { status: 502, body: { error: 'unreachable' } };
  }
  if (answer?.success !== true) return { status: 403, body: { error: 'failed' } };
  try {
    return { status: 200, body: { pass: await insertPass() } };
  } catch {
    return { status: 500, body: { error: 'pass' } };
  }
}
