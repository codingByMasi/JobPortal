// Stops a production build when src/config.js still holds the example values (a wrong UPI ID or WhatsApp number would send money or
// job seekers to the wrong place). Runs first in `npm run build`. On Cloudflare Pages (or with CHECK_CONFIG=strict) a problem stops the build;
// on your own computer it only prints a warning, so you can still try the site.
// "Hosted build" = Cloudflare Pages (it sets CF_PAGES=1) or Netlify (NETLIFY=true).
import { fileURLToPath } from 'node:url';
import * as config from '../src/config.js';

const EXAMPLES = {
  WHATSAPP_NUMBER: ['919999999999'],
  UPI_ID: ['yourname@upi'],
  UPI_NAME: ['Your Business Name'],
  CONTACT_EMAIL: ['help@example.com'],
  GRIEVANCE_NAME: ['Your Name'],
  GRIEVANCE_EMAIL: ['grievance@example.com'],
};

/** A list of plain sentences, one per setting that still has its example value. Empty = all good. */
export function configProblems(values, env = {}) {
  const problems = [];
  for (const [key, examples] of Object.entries(EXAMPLES)) {
    const value = String(values[key] ?? '').trim();
    if (!value || examples.includes(value)) problems.push(`${key} in src/config.js still has its example value.`);
  }
  if (!values.SITE_URL || String(values.SITE_URL).startsWith('PASTE_')) problems.push('SITE_URL in src/config.js is not set.');
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) problems.push('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set in the hosting settings.');
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = configProblems(config, process.env);
  const strict = process.env.CF_PAGES === '1' || process.env.NETLIFY === 'true' || process.env.CHECK_CONFIG === 'strict';
  if (problems.length === 0) {
    console.log('config check: all settings are filled in.');
  } else if (strict) {
    console.error(`config check FAILED. Fix these before publishing:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  } else {
    console.warn(`config check (warning only on your computer, the build stops on Cloudflare Pages):\n - ${problems.join('\n - ')}`);
  }
}
