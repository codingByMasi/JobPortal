# 07 - Testing

## Automated (`npm test`)
Run before every "done". Currently 275 tests (about 15 seconds). The test settings force the Supabase values empty, so the tests never use your real `.env` or touch the real project:
| Area | What is proven |
|---|---|
| `shared/lib/jobStatus` | status names, who can edit/renew, admin buttons per status, featured-first order, approval dates |
| `shared/lib/money` | paise to rupees, typed prices (no rounding mistakes), bad prices refused |
| `shared/lib/compress` | allowed file types (JPG/PNG/WebP/PDF only; SVG, GIF, EXE, HTML refused), PDF over 2 MB refused, picture size rule |
| `shared/lib/csv`, `safeUrl`, `friendlyError` | spreadsheet-formula protection, only https links, no technical words in errors |
| `shared/data/mappers` | unsafe file links dropped, demo-only base64 pictures, featured/verified, WhatsApp number cleaning |
| `shared/data/demo/demo.test.js` | **the database rules, on the demo backend**: visitors see only live ads; employers see only their own data, always start `pending_payment`, cannot change locked fields, cannot approve or mark paid, cannot post when blocked; the whole journey post -> mark paid -> approve -> apply -> hide -> delete; expiry; counts; refunds |
| `shared/data/supabase/public.test.js` | the REAL backend's public calls, against a recording stand-in for Supabase: reads the `public_jobs` view (never `jobs`), maps featured/verified/safe links, inserts only applicant fields, never reads applications back, repeat applications become a plain message |
| `shared/i18n` | Hindi has exactly the English keys; no empty text |
| `scripts/rls.test.mjs`, `rls.hardening.test.mjs`, `rls.mfa.test.mjs`, `rls.launch.test.mjs` | **about 100 security tests on the REAL database rules** (real Postgres engine, real migrations): file links, change requests, admin functions and log, payment reference, price saved with the ad, blocking, verified tag, delete rules, applicants only for verified employers, admin two-step login. See `03-database-security.md` |
| `shared/data/env.test.js`, `features/auth/landing.test.js`, `shared/lib/urlParams.test.js` | a published site without keys is blocked (never fake data); login never sends an employer to /admin; filter helper |
| `scripts/schema.test.mjs` | `schema.sql` is up to date; every table has RLS; the locking rules and storage rules exist in the SQL; admin functions check `is_admin()` |
| `scripts/pages.test.mjs` | search pages, Google job data (with the end date), share picture, sitemap; HTML from ads is escaped; public wording is true |
| `scripts/build.test.mjs` | the build stops on example settings; the security-header policy names only your project |
| `shared/data/parity.test.js` | the real and the demo data functions have the same names |
| `shared/data/demo/demo.hardening.test.js` | the new database rules, also in demo mode |
| `shared/lib/phone`, `fetchTimeout`, `features/payments`, `shared/i18n/pickLang` | WhatsApp number rules, request time limit, UPI link, start language |

**Limit:** none of these tests run Supabase's own services (Auth, Storage API, pg_cron, email). Those, and the keys, must be checked once by hand on the real project (below).

## Everything in one command
```
npm run test:all            unit + database tests, build, audit, browser tests (390 px and 1440 px, with accessibility), Lighthouse, known gaps
npm run test:all -- --live  the same, plus the live database test on the linked Supabase project (rolls back)
npm run test:all -- --skip-slow   leave out the browser tests and Lighthouse
```
Single parts: `npm test` (275 tests), `npm run build`, `npm run test:e2e` (Playwright: `e2e/public.spec.js`, `employer.spec.js`, `admin.spec.js`, `a11y.spec.js`), `npm run test:lighthouse`, `npm run test:gaps` (checks for things that are not built yet; they are expected to FAIL until fixed), `npm run test:live`. First time on a new computer: `npm ci` then `npx playwright install chromium`.
The browser tests build the site in **mock-data mode** into `dist-e2e` and never touch a real database. Results of the last full pass and what could not be tested: `14-release-readiness-report.md`.

## Live test (real Supabase project)
To change the live database use `node scripts/live-apply.mjs supabase/migrations/<file>.sql`: it runs the local tests first and stops if any fail.

`node scripts/live-e2e.mjs` plays the whole life of an ad on the linked project (85 checks) and rolls everything back. Needs `npx supabase login` and `link` once. Results of the last run and what is still untested: `12-live-test-report.md`.

## Hand checklist (demo mode or real project)
Tick these on the real project once, and again before every big release. **Hand-checked in demo mode in Steps 2-4: items 1-13** (see CHANGELOG for what was seen).
1. **Employer signup:** /signup with a new email and a password of 8+ characters -> lands on /dashboard, "You have no ads yet". Bad phone, bad email, short password and a used email each show a plain message.
2. **Post ad:** Post an ad -> fill fields, choose a picture, choose a package -> "Save and go to payment" -> payment instructions show price, UPI ID, WhatsApp button. My ads shows **Waiting for payment**. Edit works; Delete asks first.
3. **Upload rules:** a huge photo is shrunk (a 39 MB test photo became 284 KB, 1200 px wide); a PDF over 2 MB is refused with plain words; an .svg/.exe is refused; a refused file keeps the previous good file.
4. **Mark paid (admin):** log in as admin -> All ads -> **Mark as paid** (asks first) -> status becomes **Waiting for approval**; Payments shows the money.
5. **Approve / Reject:** Approve -> **Live until DATE**. Reject needs a reason (button stays off until you type one); the employer then sees "Rejected: reason".
6. **Public:** the ad appears on / and /jobs; Featured ads come first with a Featured tag; a verified employer shows "Verified recruiter".
7. **Apply:** open the ad, send the form -> clear success message; a second try with the same phone says you already applied. The employer sees the applicant and can WhatsApp them; admin sees it too and can download CSV.
8. **Hide / Show:** Hide -> ad disappears for visitors; Show brings it back.
9. **Delete:** Delete (asks first) -> ad, its applications and its file are removed; the payment record stays.
10. **Expiry:** admin edits the ad's end date to yesterday -> it disappears from the site at once and shows **Expired** to the admin; after the cron runs its status is **Expired** in the database; the employer sees **Renew**, which opens a new ad filled from the old one.
11. **Blocked employer:** admin blocks an employer -> that employer sees a plain notice and cannot post or edit. Admin accounts cannot be blocked.
12. **Language:** switch to Hindi on every screen above; nothing shows technical words (employer-typed text and package names stay as typed).
13. **Phone width:** every screen works at 375 px wide, with no sideways scrolling (tables become cards). Also checked at 1280 px.
13b. **New in Step 6 (hand-check on the real project):** forgot password email arrives and the link opens the new-password page; the CAPTCHA shows on signup (when keys are set); Admin > Security shows a QR picture, a good code turns two-step login on, and after logging out the admin area asks for the code; a rejected ad can be fixed and sent again; the ad file and WhatsApp number show in the admin list; applicants stay hidden for an unverified employer; a 4 MB file is refused; an ad shared on WhatsApp shows its picture after the next build.
14. **Real project only:** email confirmation link works; a 15 MB file is refused by Storage; an .exe renamed .jpg is refused by Storage; pg_cron changes an ended ad to Expired within 10 minutes.

## Public site on the real project (Step 2)
Follow `06-deploy.md` section C2 with `supabase/sample-ads.sql`. Expected: 3 live ads (first Featured + Verified), the ended / hidden / unpaid samples never show, Apply works once per phone, language toggle works, `/job/<id>` of an ended ad says "This job is not available now".

## Security check (real project only)
Run the 8-point list in `03-database-security.md` with two employer accounts and a visitor.

## Accessibility
Automated axe scan (WCAG 2.1 AA) at 375 px in English and Hindi: **clean on every public, employer and admin screen** (one finding on the turned-off package row was fixed). Re-run after any visual change.


**Latest full run (`npm run test:all`):** 344 unit and database tests (36 files, includes `rls.offers.test.mjs` 35 and `rls.cleanup.test.mjs`), 132 browser runs at 390 and 1440 px including the accessibility scan of every screen (offers and history added), Lighthouse phone 96-98 with layout shift 0, `npm audit` clean. Known gaps: GAP-1 only (stored files cannot be deleted from SQL; use Admin > Problems).

**Code checker:** `npm run lint` (ESLint) runs first in `npm run test:all` and in CI.

**After step 10 (job facts, trust, pages, SEO):** `npm run test:all` passes: 376 unit and database tests, all browser runs at 390 and 1440 px (with the new pages in the accessibility scan), Lighthouse phone 94-98, `npm audit` clean. Known gap still open: GAP-1.

**Final release gate (step 14):** three commands.
- `npm run test:all`: lint, unit and database tests, build, audit, browser tests (phone and desktop, accessibility), Lighthouse on Home, Jobs, Job and Post a job, known gaps.
- `npm run release:gate -- --live-readonly`: secrets (code, docs, built site, git history), placeholder text, build guards, headers, search output, abuse limits, commit and tag state, and a SELECT-only look at the linked Supabase project. Result in `test-results/release-gate.json`.
- `npm run smoke:live -- https://your-domain.com --lighthouse`: read-only checks of the live site after launch (HTTPS, www redirect, headers, sitemap, robots, deep links, share tags, console errors, phone score). It never logs in or submits anything.
The extra browser tests for the gate are in `e2e/gate.spec.js` (every private route, every deep link, Hindi on every public screen, picture zoom and PDF, coupon cases, no sideways scrolling). The report is `15-final-release-gate.md`.
