// Writes dist/_headers (read by Cloudflare Pages): the security headers for every page, and the caching rules. The Content-Security-Policy names YOUR Supabase project only
// (not every project on supabase.co), and allows the optional Turnstile check and Plausible counter only when they are turned on.
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ANALYTICS_DOMAIN, isPlaceholder } from '../src/config.js';

/** The text of the _headers file. */
export function buildHeaders({ supabaseUrl = '', turnstile = false, plausible = false } = {}) {
  let supabase;
  try {
    supabase = supabaseUrl ? new URL(supabaseUrl).origin : '';
  } catch {
    supabase = '';
  }
  const script = ["'self'", plausible && 'https://plausible.io', turnstile && 'https://challenges.cloudflare.com'].filter(Boolean).join(' ');
  const connect = ["'self'", supabase, plausible && 'https://plausible.io'].filter(Boolean).join(' ');
  const frame = [supabase, turnstile && 'https://challenges.cloudflare.com'].filter(Boolean).join(' ') || "'none'";
  const csp = [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src ${connect}`,
    `frame-src ${frame}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

# Built files have a fingerprint in their name, so they can be kept for a year and never need to be asked about again.
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# The start page must always be checked, so a new release shows at once.
/index.html
  Cache-Control: public, max-age=0, must-revalidate

# Pictures and icons keep their names between releases: one day.
/*.webp
  Cache-Control: public, max-age=86400
/*.jpg
  Cache-Control: public, max-age=86400
/*.png
  Cache-Control: public, max-age=86400
`;
}

/** Value from the environment (the hosting build) or from the local .env file. */
function setting(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env')) return '';
  const line = readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : '';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = buildHeaders({
    supabaseUrl: setting('VITE_SUPABASE_URL'),
    turnstile: Boolean(setting('VITE_TURNSTILE_SITE_KEY')),
    plausible: !isPlaceholder(ANALYTICS_DOMAIN),
  });
  await writeFile('dist/_headers', text);
  console.log('headers: wrote dist/_headers');
}
