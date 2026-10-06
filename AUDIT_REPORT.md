# AUDIT_REPORT

The full project review (91 findings, with the status of each) is in `docs/00-project-analysis.md`. The live-database test is in `docs/12-live-test-report.md`. This file holds the hosting review for Cloudflare Pages.

## Cloudflare readiness

Target: Cloudflare Pages (static files, no Pages Functions). Date: 2026-10-07. Details and evidence: `docs/13-cloudflare-pages.md`.

### Verdict
The project is **ready for Cloudflare Pages** and Cloudflare is the right place for it (static site plus Supabase; no server code; free plan limits are far above the need). No other platform is needed. One performance point that is not about the host: move Supabase from Seoul to Mumbai if you can (see `13`).

### Fixed in the repository
| # | Item | Result |
|---|---|---|
| 1 | Clean build from scratch (fresh copy, no `node_modules`, no `dist`, `npm ci`, build) | works; 0 vulnerabilities |
| 2 | Node version pinned | `.node-version` = 22, `engines` in `package.json` |
| 3 | Lockfile | `package-lock.json` committed, npm only, consistent |
| 4 | Output limits | 42 files (limit 20,000), largest 380 KB (limit 25 MiB), no source maps; ad pages capped at 1,000 |
| 5 | Workers runtime compatibility | no `/functions`, no Node-only APIs in app code, no filesystem writes, no timers or background jobs; nothing to port |
| 6 | Config | `wrangler.toml` added (output dir, compatibility date), no bindings |
| 7 | Secrets | none in the repo or in `VITE_` variables except public values; `.dev.vars.example` added, `.dev.vars` and `.wrangler` ignored |
| 8 | SPA fallback | works natively on Pages; the Netlify `_redirects` and `netlify.toml` removed; `404.html` must not be added |
| 9 | Headers | `dist/_headers`: CSP (your Supabase project only), nosniff, referrer, permissions, frame, HSTS; immutable cache for `/assets/*`; `/index.html` revalidated; tested |
| 10 | Trailing slash and prebuilt pages | pages written as flat `.html` files, served at `/jobs` and `/job/<id>` without a redirect; `/jobs/` redirects to `/jobs`; tested |
| 11 | Open page during a deploy | one automatic reload (`vite:preloadError`) |
| 12 | Hosted-build safety | build stops on Cloudflare (`CF_PAGES=1`) for example settings, missing Supabase values, or failed search pages; tested |
| 13 | Local verification | `wrangler pages dev dist`: header rules parsed (6 valid), routes and headers smoke-tested |
| 14 | CORS, redirects loops, custom 404 | no API routes of our own; no loops; soft 404 accepted (a real 404 page would break deep links) |
| 15 | Frameworks | not applicable (plain Vite + React) |

### Must be set by hand in the Cloudflare dashboard
1. Create the Pages project from Git: preset None, build `npm run build`, output `dist`, production branch `main`.
2. Variables and Secrets: **Production** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (optional `VITE_TURNSTILE_SITE_KEY`). **Preview**: a different (staging) Supabase project, or preview deployments off. Never share the production database with previews.
3. Custom domain, "Always Use HTTPS", minimum TLS 1.2; the same address in `SITE_URL`, in Supabase (Site URL and `/reset-password` redirect) and in the Turnstile hostnames.
4. Branch control: production `main`; preview only for named branches.
5. Deploy hook called every 3 hours (free plan: 500 builds a month).
6. Optional: Cloudflare Access on preview deployments; Web Analytics (then add its address to `scripts/headers.mjs`).
7. If the dashboard greys out variables because `wrangler.toml` exists, delete `wrangler.toml` (assumption, untested).

### Not verified (needs the real Cloudflare account)
The real Git build, the custom domain and TLS, the deploy hook, and the Preview/Production variable split.
