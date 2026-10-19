# 14 - Release readiness report

Date: 2026-10-07. Tester role: QA lead, security reviewer, release manager. Scope: whole repository, the real JobPortal Supabase project (read-only checks and a test that rolls back), the site built in mock-data mode for browser tests.

> **File names.** Your brief asked for `docs/12-release-readiness-report.md` and `docs/08-testing-checklist.md`. In this project `docs/12` is the live-test report and the testing guide is `docs/07-testing.md`, so this report is `docs/14-release-readiness-report.md` and the new commands are documented in `docs/07-testing.md`.

> **What was added (nothing else was changed).** Test files in `e2e/` and `scripts/` (`rls.readiness.test.mjs`, `known-gaps.check.mjs`, `e2e-server.mjs`, `lighthouse.mjs`, `test-all.mjs`), `playwright.config.js`, `vitest.gaps.config.js`, five npm scripts, two development-only tools in `package.json` (`@playwright/test`, `@axe-core/playwright`; reason in `docs/09-decisions.md`), and three lines in `.gitignore` for test output. No application code, schema or hosting settings were changed.

> **Update after the plans-and-offers work (re-run the same day).** `npm run test:all`: 344 unit and database tests pass (36 files), 132 browser runs pass at phone and desktop width (offers, free offer, extra ad buttons, plan order and history added; the two new admin screens pass the accessibility scan), Lighthouse phone 96 / 98 / 98 with layout shift 0, 0 dependency vulnerabilities. Secret scan: no `service_role` or secret key in the code, the built site or the Git history; `.env` and `.dev.vars` are ignored. No unsafe HTML calls in `src`. Fixed since this report: B1 (everything is committed), B6, B9, B10, B13, B14, offers (0018), and GAP-2 (migration 0019: ads unpaid for 30 days are removed daily; applied to the live project). Still open and not fixable from here: B2, B3, B4, B5, B11, B12 (your accounts and settings), B8 (needs Cloudflare Turnstile keys and an Edge Function), and GAP-1 (Supabase does not allow deleting stored files from SQL: Admin > Problems > "Look for unused files" removes them).

## 1. Verdict: NOT READY today (close). READY WITH CONDITIONS once conditions 1 to 6 are done

1. The code and the database rules are in good shape: 275 automated tests pass, 54 browser tests pass at phone and desktop width, 98 live database checks pass, 0 accessibility violations, 0 security-scan findings.
2. **Nothing has been committed to Git since the first commit** (about 140 changed or new files). Cloudflare builds from Git, so today it would deploy the old first version.
3. **Not one real account, real signup, real email or real file upload has ever been tested** on the live project (0 accounts exist). The riskiest single step, the signup trigger under Supabase's own login service, is unproven.
4. The settings that protect real users are in dashboards nobody has checked yet (Supabase: confirm email, email sender, password rule, backups, paid plan; Cloudflare: variables, domain, preview/production split), and `src/config.js` still holds example payment details (the build will refuse to publish until fixed, which is correct).
5. Offers and coupon codes are now built (migration 0018, see `CHANGELOG.md`; the live hand check is in `11-owner-checklist.md`). A few smaller gaps remain (orphan files, no CAPTCHA on the apply form, small tap targets, one layout shift). None of these alone blocks launch.

## 2. Test results

| Area | Test | Command or method | Result | Notes |
|---|---|---|---|---|
| Build | Clean install and build from scratch (no node_modules, no dist) | fresh copy: `npm ci` then `npm run build` (done earlier today, Cloudflare check) | **Pass** | 0 vulnerabilities; build stops on Cloudflare while example settings remain (tested with CF_PAGES=1) |
| Build | Production build | `npm run build` | **Pass** | 1.7 s. Only message: "config check: example values" (expected on your computer; on Cloudflare it stops the build). Search pages skipped locally (no SITE_URL). |
| Build | Bundle size | measured `dist/assets` | **Pass** | 699 KB raw, 205 KB compressed in 33 files; main app 113 KB + database library 56 KB compressed. Largest single file 380 KB (limit 25 MiB). |
| Build | Lint | `npm run lint` (added after this report) | **Pass** | ESLint now configured; found and fixed one duplicate text key. |
| Build | Type check | none configured | **Skipped** | Plain JavaScript, no TypeScript. |
| Build | Dependency audit | `npm audit` (all dependencies) | **Pass** | 0 vulnerabilities. |
| Unit and component | Money, status rules, files, CSV, links, errors, mappers, i18n (Hindi = English keys), phone, time limits, UPI link, page builder, headers | `npm test` (147 tests in 21 files) | **Pass** | All pass. No React component rendering tests (screens are covered by the browser tests). |
| Unit and component | Demo (mock-data) backend follows the same rules as the real one | `npm test` (demo tests + parity test) | **Pass** | Both backends have the same function names (parity test). |
| Database rules | All security rules on a real Postgres engine (PGlite) with the real migrations | `npm test` (128 tests in 6 files, 10 new today) | **Pass** | Visitor, two employers, blocked employer, admin, admin with two-step login. |
| Database rules | Live project: 98 checks through the full life of an ad, rolled back | `node scripts/live-e2e.mjs` on JobPortal | **Pass** | Ran inside `test:all` (7 s). Nothing left in the project. No real data exists there. |
| Database rules | Visitor sees only live and unexpired ads | rls.test + readiness + live | **Pass** | Through the view only; the jobs table is closed to visitors. |
| Database rules | Visitor cannot read applications, payments, profiles, audit log, settings, error log | rls.test + readiness (new whole-database guard) + live | **Pass** | New guard: across ALL tables only `packages` and `public_jobs` return rows to a visitor. |
| Database rules | Employer cannot set status, package, price, saved price, dates, role, verified, blocked | rls.test, hardening, live | **Pass** | Triggers enforce it. |
| Database rules | Employer A cannot read, edit or delete employer B's ads, payments, requests, applications | readiness (new) + rls.test + live | **Pass** |  |
| Database rules | Blocked employer cannot insert ads or upload | rls.test + live | **Pass** | Blocking also hides live ads and bans the phone (tested). |
| Database rules | Employer cannot become admin | rls.test + live | **Pass** | Signup is always an employer even if signup data says admin. |
| Database rules | Admin can read and write everything; admin functions check the ad status and are logged | rls.test, hardening, live | **Pass** | Admin with two-step login on needs the code (tested). |
| Database rules | Visitors and employers can call only an allow-list of functions | readiness (new) | **Pass** | Visitors: 5 helper functions. Employers: 12. A new function fails this test until added on purpose. |
| Database rules | Every table has Row Level Security on | readiness (new) + live query | **Pass** | 0 tables without it, local and live. |
| Pricing and offers | Price saved with the ad; later plan change does not alter it; price cannot be set by the client | hardening + live + browser (plan edit) | **Pass** | Verified also in the browser: plan changed to 999, old ad still charged 799. |
| Pricing and offers | Percent, flat, bonus-day and free offers; coupon codes (expired, used up, wrong plan, per-employer limit); price never below 0 | `scripts/rls.offers.test.mjs` (35) + known-gaps GAP-3 | **Pass** | Built after this report (migration 0018, applied to the live project). Not yet hand-checked with a real login: see `11-owner-checklist.md`. |
| File storage | Bucket accepts only JPG, PNG, WebP, PDF, 3 MB limit, public by link only | readiness (new) + live query | **Pass** | Settings confirmed on the live bucket. |
| File storage | The storage service really refuses a wrong type and an oversized file | needs the real Storage API with a logged-in user | **Not verified** | Cannot be done without a real login. See launch checklist. |
| File storage | Employer cannot overwrite, rename or delete another employer's file | readiness (new) | **Pass** | Also cannot plant a file in another folder. |
| File storage | Deleting an ad removes its picture and thumbnail | known-gaps GAP-1 | **Fail** | Only the browser removes the file; if that call fails the file stays (storage cost, old ads' pictures stay public by link). |
| File storage | Ads that waited for payment over 30 days are removed | known-gaps GAP-2 | **Fail** | Not done; bounded by the 20-unpaid-ads limit per employer. |
| Expiry | Expired ads are hidden publicly and cannot take applications | readiness (new) + rls.test + live | **Pass** |  |
| Expiry | The scheduled jobs really run | live query of the cron history | **Pass** | expire-jobs every 10 min: 139 runs recorded, last succeeded; cleanup-old-data succeeded. |
| Browser (mock data, 390 px and 1440 px) | Browse ads, search, country filter, empty search | Playwright `public.spec.js` | **Pass** | Both widths. |
| Browser (mock data, 390 px and 1440 px) | Open an ad: details, WhatsApp link with country code, safety notice, report link | Playwright | **Pass** | Link format checked; opening on a real phone is NOT VERIFIED (below). |
| Browser (mock data, 390 px and 1440 px) | Apply form: consent, success, same phone twice refused, bad phone refused | Playwright | **Pass** | Duplicate submission handled. |
| Browser (mock data, 390 px and 1440 px) | Employer signup (empty form, short password, missing tick, used email), login (wrong password), logout | Playwright `employer.spec.js` | **Pass** | Plain messages, no technical words. |
| Browser (mock data, 390 px and 1440 px) | Post an ad with a big picture (shrunk to 400 KB or less) and with a PDF | Playwright | **Pass** | A 2.9 MB noise picture was shrunk to under 400 KB. |
| Browser (mock data, 390 px and 1440 px) | Wrong file types (.exe, .svg, .html) and a 2.5 MB PDF refused; missing file/package/phone refused | Playwright | **Pass** |  |
| Browser (mock data, 390 px and 1440 px) | Payment instruction screen: ad code, amount, UPI link | Playwright | **Pass** |  |
| Browser (mock data, 390 px and 1440 px) | Edit and delete an unpaid ad; paid/live ads cannot be edited or deleted; change requests (3 open at most) | Playwright | **Pass** |  |
| Browser (mock data, 390 px and 1440 px) | Admin: mark paid (reference needed, same reference refused), reject with reason, employer fixes and resends, approve, hide, show, delete | Playwright `admin.spec.js` | **Pass** | Visitors see the ad after approval and not after hide. |
| Browser (mock data, 390 px and 1440 px) | Admin: view the ad file, refund (and hide), block employer, spreadsheet downloads, change requests | Playwright | **Pass** |  |
| Browser (mock data, 390 px and 1440 px) | Admin: edit plans (price follows on the public page) | Playwright | **Pass** |  |
| Browser (mock data, 390 px and 1440 px) | Admin: edit offers, apply a coupon | Playwright (coupon flow) | **Pass** | Built after this report: admin makes a coupon, employer uses it, the payment screen shows the discounted price. |
| Browser (mock data, 390 px and 1440 px) | Refresh on /admin (9 addresses) and /job/:id does not 404 | Playwright | **Pass** | On the preview server. The real Cloudflare behaviour was checked locally with `wrangler pages dev` (docs/13). |
| Browser (mock data, 390 px and 1440 px) | Role protection: visitor and employer cannot open /admin or /dashboard areas | Playwright | **Pass** |  |
| Browser (mock data, 390 px and 1440 px) | Hindi / English switch, remembered after reload | Playwright | **Pass** | Hindi wording quality NOT VERIFIED (below). |
| Browser (real Supabase) | The same flows against the real Supabase Auth and Storage | not possible without creating real accounts | **Not verified** | Browser tests use mock data on purpose. See launch checklist (first real signup, first real upload). |
| Accessibility | Axe (WCAG 2.1 A and AA) on 32 screens x 2 widths (public, employer, admin; Hindi on the public ones) | Playwright `a11y.spec.js` | **Pass** | 0 violations in 64 scans. |
| Accessibility | Tap target size (44 px) | Playwright (measured) | **Fail** | Sign-in and sign-up text links are 21 px tall; header Login / My account link is 43 px wide. Project rule says 52 px. |
| Accessibility | Text size (14 px) | Playwright (measured) | **Fail** | Status labels and tags are 13 px (Waiting for payment, Live, Paid, Featured, Verified) and 12 px (picture badge) on 28 screens. |
| Accessibility | Voice-control label match | Lighthouse | **Fail** | The language button shows "हिन्दी" but its spoken name is "Change language to Hindi" (WCAG 2.5.3). |
| Accessibility | Heading order | Lighthouse | **Fail** | Jobs list: ad titles are h3 straight under the page h1. |
| Performance | Lighthouse phone, slow network: Home | `npm run test:lighthouse` | **Pass** | Performance 95, accessibility 100, LCP 2.7 s, 243 KiB, CLS 0. |
| Performance | Lighthouse: Jobs | same | **Pass** | Performance 98, accessibility 98, LCP 1.9 s, 133 KiB. |
| Performance | Lighthouse: Job detail | same | **Fail** | Performance 84. Layout shift 0.281 (limit 0.1): the footer jumps when the ad loads. |
| Performance | Images compressed and lazy-loaded | code and browser test | **Pass** | Pictures shrunk to 400 KB or less at upload, small list picture about 40 KB, list pictures lazy. Real picture weight on the live site NOT VERIFIED (demo data has no pictures). |
| Security scans | Secrets and service-role keys in the files and in Git history | search of all files and `git log -p` | **Pass** | None. (Words "service_role" appear only in docs and tests.) |
| Security scans | .env ignored by Git and never committed | `git check-ignore`, `git log -- .env` | **Pass** |  |
| Security scans | dangerouslySetInnerHTML, innerHTML, eval, javascript: links | code search | **Pass** | None. Links go through `safeFileUrl`. Low: the PDF frame has no sandbox; one sign-up link opens a new tab without `rel`. |
| Security scans | Security headers in the build | `dist/_headers`, `wrangler pages dev` | **Pass** | CSP naming only your project, nosniff, frame deny, HSTS, caching rules. |
| Security scans | Headers and CORS on the deployed site | no deployed URL yet | **Not verified** | Check after the first Cloudflare deploy (checklist). |
| Security scans | Supabase security advisor | `supabase db advisors` | **Pass** | 1 expected "security definer view" (the public list), 15 expected helper/admin function notes. Nothing unexpected. |
| Abuse | Apply form flood limit (per visitor address) and duplicates | database tests + live | **Pass** | 30 an hour, 100 a day per address; same phone once per ad. |
| Abuse | CAPTCHA on the apply form | known gap | **Fail** | None. Fake phone numbers below the limits are possible; phone numbers are not verified. |
| Abuse | CAPTCHA on signup | built, needs keys | **Not verified** | Optional Turnstile is built; not switched on (no keys). |
| Manual (dashboard) | Supabase: email confirmation on, password minimum, email sender, CAPTCHA, backups, plan | dashboard only | **Not verified** | Cannot be read from here. |
| Manual (dashboard) | Supabase project not paused | `supabase projects list` | **Pass** | JobPortal is ACTIVE_HEALTHY (free plan pauses after 1 week of no use). |
| Manual (dashboard) | Cloudflare: env vars, domain, HTTPS, preview/production split | dashboard only | **Not verified** | See docs/13. |
| Manual (real world) | First real signup creates the employer profile (signup trigger under Supabase's own login service) | needs a real signup | **Not verified** | 0 real accounts exist. Highest-priority hand test. |
| Manual (real world) | Real phones on a slow network; WhatsApp link opens on Android and iPhone | real devices | **Not verified** |  |
| Manual (real world) | Hindi text reviewed by a native reader | a person | **Not verified** | Written by AI, not reviewed. |
| Manual (real world) | Link preview when an ad is shared on WhatsApp | needs the deployed site with SITE_URL and a live ad | **Not verified** |  |

## 3. Totals

| Result | Count |
|---|---|
| Pass | 47 |
| Fail | 8 |
| Skipped (not configured / not built) | 4 |
| Not verified (needs a person, a real login, or a dashboard) | 10 |
| **Rows** | **69** |

Underneath the rows: 275 unit and database tests (275 pass), 128 of them database-rule tests; 120 browser runs (54 functional pass, 2 skipped "not built", 64 accessibility scans: 18 clean, 46 flagged only by the tap-size and text-size checks, 0 by axe); 98 live database checks (98 pass); 3 known-gap checks (3 fail, as expected).

## 4. Blockers (fix before real users)

| # | Severity | Problem | Evidence | What could go wrong (plain words) | Suggested fix | Effort |
|---|---|---|---|---|---|---|
| B1 (fixed) | **High** | Nothing is committed to Git | `git status`: about 135 files changed or new; `git log`: 1 commit | You press deploy and Cloudflare publishes the first version, without the security fixes, change requests, receipts, error log or any of today's work. | Review, then `git add -A` and commit; push to a private GitHub repository; connect Cloudflare to it. | S |
| B2 | **High** | First real signup and the real login service never tested | 0 rows in `auth.users`; `docs/12` "could not be proven from here" | If the signup step fails under Supabase's own login service, every new employer sees an error and no profile is created. | Do the first real signup on the live site after Supabase settings (checklist 1-3); I check the database right after. | S |
| B3 | **High** | Supabase and Cloudflare settings unverified | `docs/11` boxes unticked | Confirm-email off means anyone can register with any email; no email sender means no confirmation or reset emails; the free plan pauses after a week and has no backups; preview builds could write into your real database. | Do `docs/11-owner-checklist.md` section A and `docs/13` "Set by hand". | M |
| B4 | **High** | Example payment details in `src/config.js` | `scripts/checkConfig.mjs` output | (The build now refuses to publish, which is the protection.) Until real values are set the site cannot go live. | Put the real UPI ID, name, WhatsApp number, emails, site address. | S |
| B5 | **High** | Real file upload never tested | live bucket settings only | If the browser's upload does not match the database path rule, employers cannot post any ad with a picture. | First real ad with a picture and a PDF, then delete it (checklist). | S |
| B6 | Medium | Job detail page: layout shift 0.281 | Lighthouse, `job.json` | The page jumps while it loads (footer moves); on slow phones people tap the wrong thing. | Reserve space for the ad area while loading. | S |
| B7 (half fixed) | Medium | Orphan files (use the Problems tool) and old unpaid ads (now removed after 30 days, 0019) | known-gaps GAP-1, GAP-2 | Pictures of deleted ads can stay public and cost storage. | A scheduled clean-up using the Storage API (Edge Function) and a 30-day rule for unpaid ads. | M |
| B8 | Medium | No CAPTCHA on the apply form | known gap; `docs/03` | Bots can fill ads with fake applicants below the per-address limits; employers then call wrong people. | Turnstile plus an Edge Function for applications. | M |
| B9 | Medium | Small tap targets and text | `test-results/a11y/*.json` | Text links on sign-in and sign-up are 21 px tall (rule: 52 px); status labels are 13 px; many users have cheap phones and big fingers. | Make those links block-level 52 px; raise label size to 14 px. | S |
| B10 | Medium | Language button label does not match its text | Lighthouse `label-content-name-mismatch` | Voice-control users cannot say "हिन्दी" to press it. | Put the visible word in the spoken label. | S |
| B11 (fixed: moved to Mumbai) | Medium | Database is in Seoul, users are in India | `supabase projects list` | Every page waits longer than needed; also a question for the data-protection lawyer. | Recreate the (empty) project in Mumbai now; later it is a migration. | M |
| B12 | Medium | No staging project; browser tests cannot reach real Auth | by design | Real signup, email and upload problems only show up in production. | A second free Supabase project for staging (docs/11 D). | M |
| B13 | Medium | CI runs only unit tests, build and audit | `.github/workflows/ci.yml` | Browser and accessibility tests are not run automatically on each change. | Add `npm run test:e2e` to CI (needs a Playwright install step). | S |
| B14 | Low | PDF frame has no `sandbox`; Terms link opens a tab without `rel`; Jobs list heading order | code search, Lighthouse | Minor hardening. | Small edits. | S |
| B15 | Low | Search pages and WhatsApp previews built only at deploy time | `docs/13` | New ads show a generic preview until the next build (every 3 hours). | Deploy hook on a schedule (checklist). | S |

## 5. Before taking payments, and later

**Before taking payments (manual UPI counts as taking payments):** B1 to B5; accountant answers on GST and receipts; employer terms and refund rule reviewed by a lawyer; a second admin with two-step login on; weekly backup secrets set and one test restore; decide who checks the bank statement daily (the admin guide says never mark paid from a screenshot).
**Online payments:** not used; payment is UPI + QR + proof (`docs/08`).
**Nice to have later:** offers and coupons (if wanted), UPI QR picture, server-side paging (before about 500 live ads), email or WhatsApp notices to employers, staging project, B7, B8, B13, B14.

## 6. What is not built or not documented (compared with docs 01-11 and your brief)

| Item | State |
|---|---|
| Offers, coupon codes, discounts, bonus days, free offers | Built after this report (0018). |
| Admin "edit offers" | Built after this report (Admin > Offers). |
| Online payment gateway | Not used (decision of the owner, `docs/08`). |
| Deleting an ad removes its file in the database | Not built (browser only). |
| Automatic removal of old unpaid ads and their files | Not built. |
| CAPTCHA on the apply form | Not built (per-address limits are). |
| Email or WhatsApp notices to employers | Not built (admin has a WhatsApp button). |
| Staging environment, error monitoring beyond Admin > Problems | Not built. |
| `docs/04-screens.md` "Checked" column | Out of date for the screens added after Step 5; `docs/07` counts updated today. |
| README test count | Says about 240; real number is 275 plus browser tests. |

## 7. Launch checklist for you

- [ ] Review and commit everything to Git; push to a private GitHub repository (B1)
- [ ] Supabase: paid plan; Confirm email ON; minimum password 8; your own email sender; redirect address `/reset-password`; CAPTCHA keys (optional); backups visible in the dashboard (B3)
- [ ] Decide the database region (Mumbai?) before real data exists (B11)
- [ ] Fill `src/config.js` with real values (B4)
- [ ] Cloudflare Pages: project from Git; Production variables; Preview = separate staging project or off; custom domain; HTTPS; deploy hook every 3 hours (B3, B15)
- [ ] Open the deployed site: `/`, `/jobs`, a deep link such as `/dashboard`, refresh each; check response headers in the browser developer tools
- [ ] **First real signup**; tell me, I check the database (B2)
- [ ] Make yourself admin; create a second admin; turn on two-step login for both
- [ ] Post one real ad with a picture and one with a PDF; mark paid; approve; open as a visitor; apply; ask for a change; delete; confirm the file is gone from the bucket (B5, GAP-1)
- [ ] Share one live ad on WhatsApp and look at the preview
- [ ] Open the site on a cheap Android phone on a slow connection and on an iPhone; tap Apply on WhatsApp on both
- [ ] A native Hindi reader reads `src/shared/i18n/hi.js` and the legal texts
- [ ] Lawyer: recruitment rules, data rules, employer terms and refund rule; accountant: GST and receipts
- [ ] Set up uptime alerts (site and Supabase address); weekly backup secrets; do one test restore
- [ ] Open Admin > Problems after the first week

## 8. Re-run everything with one command

```bash
npm run test:all
```
It runs: unit and database tests, production build, dependency audit, browser tests at 390 px and 1440 px (including accessibility), Lighthouse, and the known-gap checks (expected to fail until fixed), then prints a summary table. Options: `--live` adds the 98-check test on the linked real Supabase project (rolls back); `--skip-slow` leaves out browser tests and Lighthouse.
Single parts: `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:lighthouse`, `npm run test:gaps`, `npm run test:live`.
First time on a new computer: `npm ci` then `npx playwright install chromium`.
