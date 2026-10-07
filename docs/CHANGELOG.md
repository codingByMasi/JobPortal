# Changelog

## Step 13 - Moved to a Mumbai database
- A new Supabase project **JobPortal-Mumbai** (`nvjoiomubxtqnnlmfzkb`, region `ap-south-1`) was created and `scripts/move-project.mjs` moved the app to it: all 21 migrations, the sample plans, the project's own storage address, the public key in `.env`. The live test passes 98 of 98 on the new project; 16 tables all have row security; the expiry and clean-up schedules are running; the bucket exists; no users and no data yet (nothing to copy). The old Seoul project (`nxdwnmoqtyfosrxbpmze`) is untouched and can be paused or deleted once you are happy. Steps still to do by hand in the new project: `docs/11-owner-checklist.md`.

## Step 12 - Shop details changed by the admin (migration 0021)
- New table `site_settings` and function `admin_save_settings` (migration 0021): WhatsApp number, UPI ID and its name, emails, complaints person, company name and site address are now saved in the database and changed in **Admin > Settings**; no code change or release needed. Values are checked; every change is logged with old and new value; the UPI details are readable only by logged-in people.
- The site reads them with `useSettings()`; whatever is empty is hidden (no WhatsApp button, "payment details are not ready" on the payment screen), so an example value can never reach a visitor. The admin home shows a red reminder while any are missing.
- The hosted build no longer stops on example values in `src/config.js` (they are only demo defaults now); it still needs the two Supabase values. The pre-render takes the site address from `SITE_URL`, else from Admin > Settings, else from `src/config.js`.
- Tests: 6 database tests, demo and lib tests, a browser test; the new screen is in the accessibility scan.

## Step 11 - Production tidy-up
- ESLint added (`npm run lint`, in CI and `test:all`); fixed a duplicate text key; the prerender can take the site address from the environment (`SITE_URL`) and was run once for real against the live public view (job facts view, country and fixed pages, sitemap all written); a read-only browser check of the real-mode build against the live project found no errors; CLAUDE.md folder note corrected; repository moved to `codingByMasi/JobPortal` and pushed.

## Step 10 - Job facts, trust, pages, SEO, counters (migration 0020)
- **Job facts:** salary range and currency, experience, vacancies, last date, visa type (all optional) in the employer form, admin edit, list card, ad page and public list; experience filter; "New" tag for ads under 3 days.
- **Trust:** fraud banner on Home and ad pages; "Report this ad" is now a form saved in a new `reports` table (limits per visitor address) with an admin Reports screen; the employer's registration number is shown with the Verified badge only after admin verifies.
- **Pages:** About, FAQ, Refund policy, Delete my account (saved in `deletion_requests`), all in English and Hindi, linked in the footer. Texts are drafts with marked placeholders (`11-owner-checklist.md` B2).
- **SEO:** country landing pages (`/jobs/uae` ...), page titles and descriptions, sitemap with the new pages, salary in Google job data, plan and trade-offs in `15-seo-plan.md`.
- **Counters:** live ads, verified employers and applications on Home, from `public_counts()`, shown only above zero.
- **Research:** `14-competitor-comparison.md` (public pages of a competing site; no code changed for it).
- **Tests:** 14 database tests (`scripts/rls.trust.test.mjs`), demo tests, facts/page/sitemap tests, 8 browser tests; new pages added to the accessibility scan.

## Step 9 - Re-run of the release audit and fixes
- Migration 0019: ads unpaid for 30 days are removed by the daily clean-up (applied to the live project). New test `scripts/rls.cleanup.test.mjs`.
- Browser tests added: free offer, more days / featured / free ad on one ad, plan order and history; offers and history screens added to the accessibility scan. Full run: 344 unit and database tests, 132 browser runs, Lighthouse 96-98. Secret scan clean. Report updated in `14-release-readiness-report.md`.

## Step 8 - Flexible plans and offers (migration 0018)
- **Database:** plans got a description, order, badge and file limit; new tables `offers`, `offer_redemptions`, `audit_log`; every ad and payment saves the price it was bought at (list price, discount, final price, offer, final days); `quote_price` is the only place a price is worked out and `create_ad_order` saves the order (a free total is paid at once); admin functions to give more days, set featured on one ad and give a free ad; the plan of an ad stays readable when the plan is turned off; a plan with ads cannot be deleted; changes to plans and offers are logged. The migration is applied to the live project and registered.
- **Admin screens:** Packages (order, badge, description, safe delete), Offers (status, uses, plain-words example, coupon generator, copy, who used it, "Give offer" from an employer), History (filterable change log), per-ad extra buttons, dashboard money after discounts and top offers.
- **Employer screens:** plan cards with the crossed-out list price, the best automatic offer and badges; coupon box with plain-words refusals; "what you pay" box; the payment screen shows the saved price. The browser never works out a price.
- **Tests:** 35 database tests for offers and prices (`scripts/rls.offers.test.mjs`), demo-mode tests, pricing and preview tests, and a browser test for the coupon flow (the old "not built" placeholder is now a real test). Whole-database guard lists updated.

## Step 6 - Fixes from the project analysis (`00-project-analysis.md`)
All 91 findings were handled; the status of each is at the end of `00-project-analysis.md`. Items that need your accounts, money or a professional are in `11-owner-checklist.md`.
- **Database (migrations 0010-0014):**
  - **0010** the ad file link is built by the database (no outside links); private `app_settings` table.
  - **0011** change requests: employers ask us to change a paid ad (max 3 open per ad).
  - **0012** price and days saved with the ad; approve/reject/hide/show/refund as checked functions with an `admin_log`; payment reference (unique) and one paid payment per ad; payments kept when an employer is removed; employers delete only unpaid/rejected/ended ads; a rejected ad can be fixed and sent again; blocking hides live ads; changing company name or registration number removes the verified tag; visitors read ads only through the view; WhatsApp number rule (10-15 digits, 91 added); thumbnails and details text; file limit 3 MB and 100 files; indexes; 180-day clean-up of applications; pg_cron schedule.
  - **0013** admin two-step login (authenticator app) enforced by the database once turned on.
  - **0014** applicants' names and phones only for verified employers.
- **Screens:** forgot/reset password, "My details" page, registration number and rules tick-box on signup (optional Turnstile CAPTCHA), consent tick-box on the apply form, "Report this ad", ad details text, big "Open the PDF" button, small list pictures, admin: View ad file, mark paid with reference, WhatsApp the employer, first-ad and same-number hints, payments CSV, refund can hide the ad, registration number column, Change requests, Security (two-step login); public prices on Post-a-job; UPI app link with amount and ad code; named complaints contact; employer rules in Terms; Privacy rewritten.
- **Speed and size:** employer and admin screens load on demand (first load about 5 KB smaller compressed, admin code no longer downloaded by visitors), list pictures about 40 KB, hero preload removed from other pages, 20-second request time limit, text 16 px, Hindi default for Hindi phones.
- **Build and safety:** the build stops on Netlify if `src/config.js` has example values; security headers are written at build time and name only your own Supabase project; the build stops on Netlify if the search/share pages cannot be written; share preview uses the ad's picture; Google job data now has its end date; public wording fixed ("Posting is free" and "we do not collect your name" were wrong).
- **Tests:** tests no longer read your `.env` (2 tests used to fail on this machine); 162 -> 243 tests; every new database rule was broken on purpose once to check a test fails.
- **Operations:** weekly encrypted database backup workflow (needs two GitHub secrets); `10-admin-guide.md` (plain daily guide) and `11-owner-checklist.md`.
- **Release-readiness test pass (`14-release-readiness-report.md`):** Playwright browser tests (phone + desktop, 54 pass), axe on every screen (0 violations), Lighthouse script, 10 whole-database guard tests, known-gap checks, and `npm run test:all`. Verdict NOT READY today, close; blockers listed in the report.
- **Launch hardening (migration 0017):** apply-form flood limits per visitor address; blocked contacts (a banned phone cannot come back with a new login); crash reports and Admin > Problems; printable receipts; explicit right for Supabase's login service to run the signup trigger. 19 new database tests; 13 new live checks (now 98); migration history registered with the CLI.
- **Cloudflare Pages readiness (`13-cloudflare-pages.md`, `AUDIT_REPORT.md`):** hosting moved from Netlify to Cloudflare Pages: `wrangler.toml`, `.node-version`, `.dev.vars.example`, caching rules in `_headers`, `netlify.toml` and `_redirects` removed (Pages serves the app for unknown addresses by itself), prebuilt pages written as flat `.html` files (no trailing-slash redirect), one automatic reload after a new release, clean install and build tested, run locally with `wrangler pages dev`.
- **Supabase checker (Advisors):** migrations 0015 (internal functions closed, search paths fixed) and 0016 (faster rules); `scripts/live-apply.mjs` applies a migration safely (tests, then live, then live test). One live incident and its fix are in `12-live-test-report.md`.
- **Whole-app browser run** (visitor, employer, admin, all flows, about 85 checks): found and fixed one bug (demo mode dropped an ad's details and small picture). Details in `12-live-test-report.md`.
- **Live test:** the database was set up on the real JobPortal project and a full 85-check test ran there (`scripts/live-e2e.mjs`, everything rolled back): all passed. Report: `12-live-test-report.md`.
- **Not done in code (see `00` status table):** server-side paging (not needed before about 500 live ads), error reporting service, staging project, end-to-end browser tests, QR picture for UPI (the UPI app link is there), CAPTCHA for the apply form, automatic deletion of old unpaid ads and their files.

## Step 5 - Hardening
- **Real database tests:** the real migrations now run in a real Postgres engine (PGlite) and 59 tests act as visitor / employer / blocked employer / admin (`scripts/rls.test.mjs`). Four deliberate breakages of the rules were all caught.
- **New database limits (migration 0009):** max 20 ads waiting for payment, max 200 files per employer, profile text length limits, public view explicitly read-only, and mark-as-paid now locks the ad (no double payment when two admins click together).
- **Production safety:** a published site without Supabase keys shows a "not ready" page instead of fake demo data; private pages (login, signup, dashboard, admin) are `noindex`.
- Login redirect rule extracted and tested (`landingPath`); an employer can no longer be sent to an admin address.
- Checked: no dangerous HTML patterns, no secrets in the repo, `npm audit` clean, full production build under the real security headers shows no violations.
- Tests: 74 -> 162.
- Docs: security doc now describes how each rule is tested and what is NOT covered (Supabase's own services).

## Step 4 - Admin area (hand-verified in demo mode)
- Checked every admin screen by hand: dashboard counts; all-ads list with status filter and search; Mark as paid, Approve, Reject (reason required), Hide/Show, Edit (incl. end date), Add ad, Delete; employers (verify, block, ads and payments pop-up; admin cannot be blocked); payments (filters, add, refund, totals); packages (add, edit, turn off, employer picker follows); applications (search, CSV).
- Fixed: turned-off package row failed the contrast rule; "No payments yet" / "No one has applied yet" were shown for empty *searches* (now "found" wording); package form reminds to write Hindi and English names.
- Axe clean on all admin screens at 375 px in both languages; no sideways scrolling at 375 px or 1280 px.

## Step 3 - Employer area (hand-verified in demo mode)
- Checked by hand: signup validation, post ad (a 39 MB photo shrunk to 284 KB at 1200 px; wrong types and a 3 MB PDF refused; refused files keep the previous good file), package cards, payment instructions, my ads in every status, edit, delete (asks first, Esc, focus kept in pop-up), renew (prefilled, old ad stays expired), payments and applications lists, blocked-employer view, rejected-with-reason view, logout and page guards.
- Fixed: a form error stayed on screen after being fixed (now clears as soon as the box is edited); a bad email said "fill this box" (now says what is wrong); the Copy button did nothing visible when the browser blocked copying (now says how to copy by hand); an employer sent to login from /admin landed on /admin after logging in.

## Step 2 - Public site on real data
- Saved copy on the phone: an ad that ended since the last visit no longer shows (`publicJobs` in `jobStatus.js`, tested).
- Apply form protection (migration 0008): one application per ad per phone number (last 10 digits), at most 1000 per ad. Plain messages in both languages. The demo backend follows the same limits.
- `supabase/sample-ads.sql`: test ads for a real project (3 live incl. one featured, 1 ended, 1 hidden, 1 unpaid).
- New tests (now 87) for the real Supabase public calls using a recording stand-in client.
- Fixed: the brand name was cut off ("Jobs Abr...") on phones; it now fits in English and Hindi.
- Hand-checked in demo mode at 375 px: 9 public pages x 2 languages have no sideways scrolling and zero axe (WCAG 2.1 AA) problems; filters and search (and their links), featured-first order, empty state, zoom (focus, Esc, scroll lock), PDF embed and fallback link, apply + duplicate message in both languages, expiry by admin edit (ad leaves the public list at once).

## Step 1 - Foundation
- Reorganised `src/` into `app/`, `features/*`, `shared/*`, `styles/`. All imports updated; app behaves as before.
- Split the two big data files into small modules by area under `shared/data/supabase` and `shared/data/demo`; added a guard so a missing data function fails loudly.
- Split the translations into `en.js` and `hi.js` (+ key-match test).
- Database: one big SQL file became numbered migrations (`0001`-`0007`) + `seed.sql`; `schema.sql` is now generated (`npm run schema`) and tested.
- **Security fix found in self-review:** a trigger now makes `file_url` point only at our own storage and match `file_path` (before, any https link was accepted).
- Build-time search pages now read live ads from Supabase instead of the old Google Sheet; security headers allow Supabase.
- Tests grew from 42 to 74 (rules of the demo backend, status rules, money, uploads, CSV, errors, mappers, SQL checks, data-change signal).
- Bug fix found by hand-testing: after an admin approved or changed an ad, the public list did not update until a full reload. Now every data change that affects visitors makes the public list reload (`DATA_CHANGED` signal in `shared/data/index.js`).
- Bug fix: the Payments footer was labelled "Money this month" but totalled all shown rows; now "Total paid (rows shown)".
- Login with an unconfirmed email now says so in plain words (before: a generic error).
- Wrote `CLAUDE.md` and `docs/01`-`09`; rewrote `README.md`.

## Before Step 1 (prototype)
- Phase 1 screens and data layer written in a flat structure (public site, employer area, admin area, demo mode, Supabase SQL). Partly hand-tested in demo mode.
