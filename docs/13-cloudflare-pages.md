# 13 - Cloudflare Pages readiness

Date: 2026-10-07. Target: **Cloudflare Pages** (static files; no Pages Functions). Summary of the audit in `AUDIT_REPORT.md`.

## Should this project be on Cloudflare?
**Yes.** It is a static site (React files) plus Supabase. There is no server code of our own, so nothing can be "incompatible" with the Workers runtime. Checked in Cloudflare's own documentation on 2026-10-07:
- Free plan: 500 builds a month, 20,000 files per site, 25 MiB per file, 100 header rules (2,000 characters each), 2,000 static redirects, unlimited preview deployments, 20-minute builds. Static asset requests are free.
- Cloudflare now steers new projects to "Workers with static assets" and describes Workers as the broader platform; Pages stays supported. Our output is plain static files plus `_headers`, which both understand, so moving later needs no code change.
- Not recommended here: Vercel (its free plan is not for commercial use), GitHub Pages (no custom security headers).
- Done: the Supabase project was moved from Seoul to Mumbai (`ap-south-1`) in step 13. It used to be in Seoul (`ap-northeast-2`) while users are in India. A Mumbai (`ap-south-1`) project would be faster. The region cannot be changed later; recreate the project (no real data yet) if you want it.

## What was checked and fixed
| Area | Result |
|---|---|
| Build command and output | `npm run build`, output `dist`. Checked in a **clean copy**: no `node_modules`, no `dist`, `npm ci` then build: works, 0 vulnerabilities. |
| Node version | `.node-version` = 22 (Cloudflare reads it) and `engines` in `package.json`. CI uses 22 too. |
| Lockfile | `package-lock.json` committed, npm only. `npm ci` accepts it. |
| Output size | 42 files (limit 20,000), biggest file 380 KB (limit 25 MiB), no source maps, 1.2 MB in total. Prebuilt ad pages are capped at 1,000 files by the build query, so the limit cannot be reached. |
| Runtime (Functions) | There is **no `/functions` folder** and no server code. No Node-only APIs in `src` (only a test reads files). Wrangler confirmed "No Functions". Payments in Phase 2 are planned as Supabase Edge Functions (not Cloudflare), so the Workers limits do not apply. |
| State and background jobs | None on Cloudflare. Scheduled work runs in the database (pg_cron). |
| Config | `wrangler.toml`: `pages_build_output_dir = "dist"`, `compatibility_date`. No bindings (no KV, D1, R2, AI). |
| Secrets | None in the repo. Only public values are in `VITE_` variables (Supabase project address and public key, optional Turnstile site key). Verified by search. `.dev.vars.example` added; `.dev.vars` and `.wrangler` are git-ignored. |
| Routing | Cloudflare serves the app for any address with no file, so deep links and refresh work (tested with `wrangler pages dev`: `/dashboard/new`, `/login`, unknown addresses). **Do not add a `404.html` or a `/* /index.html` redirect**: the first turns this behaviour off, the second is not needed. The old `_redirects` and `netlify.toml` were removed. |
| Trailing slash | A folder page (`jobs/index.html`) is redirected to `/jobs/` on Pages. The build now writes flat files (`jobs.html`, `job/<id>.html`), which are served at exactly `/jobs` and `/job/<id>`, matching the share preview address and sitemap. `/jobs/` redirects to `/jobs`. Tested. |
| Headers | `dist/_headers` (6 rules, limit 100): Content-Security-Policy naming only your Supabase project, nosniff, frame deny, referrer policy, permissions policy, HSTS; `/assets/*` cached for a year (immutable); `/index.html` always revalidated; pictures one day. Tested: all headers arrive. |
| CORS | No API routes of our own, so nothing to configure. Supabase handles CORS for the browser calls (allowed by the CSP `connect-src`). |
| Custom 404 | Unknown addresses show the app's own "page not found" screen with status 200 (soft 404). Accepted: a real 404 page would break deep links. |
| After a new release | A page left open during a deploy may ask for a file that is gone. The app now reloads itself once (`vite:preloadError`) instead of showing a blank error. |
| Hosted build checks | The build stops on Cloudflare (it sets `CF_PAGES=1`) if the Supabase values are missing or the search/share pages cannot be written. (The shop details are no longer checked at build time: the admin fills them in Admin > Settings and the site hides what is empty.) Tested. |
| Framework adapters | Not applicable: plain Vite + React, no Next.js/SvelteKit/Astro/Remix/Nuxt. |

## Differences found with `wrangler pages dev` compared with a Node server
1. Pages redirects `/folder/index.html` pages to `/folder/` (fixed by flat files, above).
2. A missing file under `/assets/` returns the app's start page with status 200 (the fallback), not a 404. Handled by the one-time reload after a release.
3. The local Cloudflare runtime crashed once at start on this Windows machine and then served normally after a restart. Nothing in the project causes it.

## Set by hand in the Cloudflare dashboard
Nothing below can be done from the code:
1. **Create the project:** Workers & Pages > Create > Pages > Connect to Git. Framework preset None; build command `npm run build`; output directory `dist`; root directory empty; production branch `main`.
2. **Variables and Secrets** (build-time, typed per environment):
   - **Production:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_TURNSTILE_SITE_KEY`.
   - **Preview:** use a **different Supabase project** (staging), never the production one; or switch preview deployments off (Settings > Builds > Branch control > Preview branches: None). Otherwise any pull request or branch would write into your real database.
   - Do not create a variable for the service-role key or any payment secret here.
3. **Found on the first real build (2026-10-08):** because `wrangler.toml` exists, Cloudflare reads the build variables from that file and ignores the dashboard list (log line "Build environment variables: (none found)"). So the two PUBLIC values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are now written in the `[vars]` block of `wrangler.toml`. They are public by design. Never put a secret there. To change the database project later, edit that block (or run `scripts/move-project.mjs`, then copy the new values).
4. **Custom domain:** Custom domains > Set up a domain. Turn on "Always Use HTTPS" and set the minimum TLS version to 1.2 for the zone. Then use the same address in `SITE_URL` (`src/config.js`), Supabase (Site URL, `/reset-password` redirect) and the Turnstile widget's hostnames.
5. **Deploy hook:** Settings > Builds > Deploy hooks. Call it every 3 hours from a free cron service (500 builds a month on the free plan).
6. **Preview protection (optional):** Cloudflare Access on preview deployments, so staging is not public.
7. **Branch deploy settings:** production branch `main`; preview only for branches you name.
8. **Cloudflare Web Analytics (optional):** if you turn it on, add its script address to `scripts/headers.mjs` (script-src and connect-src) on purpose.
9. Check the first deployment: open `/`, `/jobs`, a deep link such as `/dashboard`, and view the response headers in the browser developer tools.

## Not tested here (needs the real Cloudflare account)
The real Git build, the real custom domain and TLS, the Deploy hook, Cloudflare's edge behaviour for `_headers` (parsed correctly by Wrangler: "6 valid header rules"), and the Preview/Production variable split.

## DNS notes for deshduniyanaukri.com (kept so a change can be undone)
- **Before the site went to Cloudflare Pages (2026-10-08):** the root name `deshduniyanaukri.com` had an `A` record pointing to the old server `2.57.91.91` (Proxied), and `www` was a CNAME to the root (Proxied). Both showed a warning because they pointed away from Pages.
- **What was done:** both records were deleted; the custom domains `deshduniyanaukri.com` and `www.deshduniyanaukri.com` were then added in Workers & Pages > project > Custom domains, which creates the correct CNAME records to the `*.pages.dev` address.
- **To undo:** add an `A` record, name `@`, content `2.57.91.91`, Proxied, and remove the Pages custom domain.
- **Keep:** the Resend email records (the `resend._domainkey` TXT, plus the MX and SPF TXT records on the `send` name if present) and any MX records. They carry the email sender. Never delete them when cleaning up.
- Public information only; there is no secret in this note.
