// Stops a hosted production build when the connection to the database is not set (the site would otherwise show a "not ready" page).
// Runs first in `npm run build`. On Cloudflare Pages (or with CHECK_CONFIG=strict) a problem stops the build; on your own computer it only prints a warning.
// "Hosted build" = Cloudflare Pages (it sets CF_PAGES=1) or Netlify (NETLIFY=true).
//
// The WhatsApp number, UPI ID, emails, company name and site address are NOT checked here any more: the admin fills them in the app
// (Admin > Settings, saved in the database) and the site hides whatever is not filled in, so no example value can ever reach a visitor.
import { fileURLToPath } from 'node:url';

/** A list of plain sentences, one per problem. Empty = all good. */
export function configProblems(_values, env = {}) {
  const problems = [];
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) problems.push('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set in the hosting settings.');
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = configProblems({}, process.env);
  const strict = process.env.CF_PAGES === '1' || process.env.NETLIFY === 'true' || process.env.CHECK_CONFIG === 'strict';
  if (problems.length === 0) {
    console.log('config check: the database connection is set.');
  } else if (strict) {
    console.error(`config check FAILED. Fix these before publishing:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  } else {
    console.warn(`config check (warning only on your computer, the build stops on Cloudflare Pages):\n - ${problems.join('\n - ')}`);
  }
}
