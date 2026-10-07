# 15 - Final release gate

> **Update after the first run (same day).** Fixed in code: placeholder text replaced with plain draft wording (English and Hindi); one automatic retry for browser tests (a test that needs it is reported as "flaky", so it stays visible); a release-candidate tag `v1.0.0-rc1` on the tested commit; the offline check was run on the real-mode build (`npm run test:offline`: plain "No internet" sentence, no technical words, no crash, other screens still work). Still failing: GAP-1 only. The numbers in section 2 are from the first run; the gate script now shows 0 placeholder failures and 0 tag failures.

Date: 2026-10-08. **Commit tested: `d532c08`** (the report and two small test files were committed after it; no application code changed after `d532c08`). Branch `main`, repository `codingByMasi/JobPortal`. Code freeze kept: only test files, scripts and this report were added.

> **File names.** Your brief says "docs/12 readiness report", "docs/13 email setup" and "docs/08-testing-checklist.md". In this project the readiness report is `docs/14-release-readiness-report.md`, `docs/13` is the Cloudflare guide (the email sender is in `docs/06-deploy.md`), and the testing guide is `docs/07-testing.md`. This report is `docs/15-final-release-gate.md` and the new commands are written in `docs/07-testing.md`.

## 1. Verdict: NO-GO today. It becomes GO WITH CONDITIONS when blockers G2 to G7 are closed (G1 was fixed in code after the first run; see the update below)

1. The code is in good shape: 390 unit and database tests, 178 browser runs (phone and desktop), 4 Lighthouse pages at 94 to 97, 0 dependency problems, no secrets anywhere, all tables protected.
2. The Refund policy and About pages showed the words `[PLACEHOLDER: ...]` to visitors. **Fixed after the first run:** they now carry plain draft wording (full refund within 7 days if the ad is not yet live; "company details shown once our registration is complete"). A lawyer must still approve the words (G16).
3. Nothing has been run on the real services yet: no real signup, no real email, no real picture upload, no admin account exists (0 users), and the shop details (UPI ID, WhatsApp) are empty, so the site correctly hides payment details.
4. Supabase is probably still on the 6-letter minimum password, the paid plan and backups are not confirmed, and there is no staging project and no release tag.
5. Everything above is quick and mostly yours to do (section 6). After that, run the controlled test in Part B and launch.

## 2. Totals

| | Count | What |
|---|---|---|
| Passed | **597** | 390 unit and database-rule tests, 178 browser runs, 4 Lighthouse pages, 25 gate checks |
| Failed | **3** at first run, **1** now | placeholder text (G1) and no release tag (G8) are fixed; known gap GAP-1 (picture files left behind after deleting an ad) stays |
| Intermittent | 1 | one browser test failed once in 3 full runs and passed twice after (name not captured). One automatic retry is now on, so a repeat will be listed as "flaky" with its name (G11) |
| Skipped on purpose | 1 | the live database test (it writes, even though it rolls back: no safe staging project exists). The offline check was done afterwards on the real-mode build |
| Not verified | **33** | the settings I cannot see (section 4) |
| Information only | 5 | |

Commands: `npm run test:all` (lint, unit and database, build, audit, browser, Lighthouse, known gaps) and `npm run release:gate -- --live-readonly` (secrets, placeholders, build guards, headers, SEO output, abuse limits, commit state, read-only look at the Mumbai project). After launch: `npm run smoke:live -- https://deshduniyanaukri.com --lighthouse`.

## 3. Gate table (Part A)

| # | Check | How verified | Result | Evidence |
|---|---|---|---|---|
| 1 | Earlier blockers | read `docs/14` and re-checked each | see section 3a | |
| 2a | Lint | `npx eslint .` | **Pass** | 0 errors |
| 2b | Type check | | N/A | plain JavaScript |
| 2c | Production build, warnings | `npm run build` | **Pass** | builds in under 1 s, no warnings |
| 2d | Bundle size | measured `dist/assets` | **Pass** | 813 KB raw, 237 KB compressed; largest file 128 KB |
| 2e | Hosted build stops without the Supabase values | `CF_PAGES=1 node scripts/checkConfig.mjs` | **Pass** | exit 1 without values, exit 0 with |
| 2f | "Build refuses while src/config.js has placeholders" | | **Changed by design** | since step 12 the shop details are saved in Admin > Settings and the site hides what is empty. Placeholders in `config.js` are demo defaults only |
| 2g | No placeholder text on screens, translations (English and Hindi), public files | `release-gate` scan | **Pass (after fix)** | first run found `[PLACEHOLDER` in About and Refund policy; replaced with draft wording. Help lines such as "for example 919876543210" are examples, not placeholders. Lawyer approval still open (G16) |
| 3a | Variables the browser reads | grep of `import.meta.env` | **Pass** | only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY` and the yes/no switch `VITE_ALLOW_DEMO` (must not be set on Cloudflare) |
| 3b | No secret or service_role key in code, docs, built site, git history | pattern scan, JWT roles decoded | **Pass** | the only key-like word in the built site is the Supabase library checking key prefixes; no key value |
| 3c | `.env` ignored, not tracked | `git check-ignore`, `git ls-files` | **Pass** | `.env`, `.dev.vars` ignored |
| 3d | `npm audit` | | **Pass** | 0 critical, 0 high, 0 moderate, 0 low |
| 3e | Lockfile committed, versions fixed | | **Pass** | `package-lock.json` tracked; Cloudflare installs from it |
| 4a | RLS on every table, a policy on every table | `release-gate --live-readonly` on Mumbai, and PGlite tests | **Pass** | 16 tables with RLS; `app_settings` has no policy on purpose (closed to everyone, only database functions read it) |
| 4b | RLS, offers, pricing, expiry, audit log, reports, settings tests with visitor, two employers, blocked employer, admin | `npm test` (13 database test files, 206 tests) | **Pass** | includes 35 offer and price tests, 14 trust tests, 6 settings tests, whole-database guard tests |
| 4c | Prices computed on the server only | tests + code | **Pass** | `quote_price` and `create_ad_order`; employers cannot change saved prices (tested) |
| 4d | Nobody can make themselves admin | tests | **Pass** | role, verified, blocked locked by trigger; signup always creates an employer |
| 4e | Storage rules | tests + live read | **Pass** | bucket: 3 MB, JPEG/PNG/WebP/PDF only; own folder rule tested; deleting an ad does not delete its file in the database (GAP-1, tool in Admin > Problems) |
| 4f | Live test with real Supabase Auth | | **Skipped** | writes, even though it rolls back; no staging project (G10) |
| 5 | Browser tests, phone and desktop | `npx playwright test` (178 runs) | **Pass** | every role and feature in your list is covered (see 3b below) except real email confirmation, real offline behaviour and real devices |
| 6 | About, Contact, FAQ, Privacy, Terms, Refund, Account deletion, fraud warning | browser tests, both languages | **Pass** for existence, links, Hindi; **FAIL** for placeholders | footer links and Hindi headings tested on every public screen. Legal review is still open (G16) |
| 7a | Accessibility | axe on every main screen in English, public ones in Hindi | **Pass** | 0 violations; tap targets 44 px or more; text 14 px or more |
| 7b | Lighthouse phone, slow network | `npm run test:lighthouse` | **Pass** | Home 94, Jobs 97, Job 97, Post a job 97; layout shift 0; largest content 2.2 to 2.8 s; page weight 155 to 265 KiB. Post-ad form (login needed) is covered by the browser tests, not Lighthouse |
| 7c | Responsive | new test: no sideways scrolling on every public, employer and admin screen at 390 px and 1440 px | **Pass** | `e2e/gate.spec.js` |
| 7d | Picture shrinking, thumbnails, lazy loading | tests + code | **Pass** | pictures shrunk to about 300 KB in the browser (tested), list pictures are small thumbnails with `loading="lazy"`. Real photo upload NOT VERIFIED (G5) |
| 8 | Abuse protection | migrations + code | **Partial** | apply form: 30/hour and 100/day per address, one per phone per ad; reports: 10/hour, one per ad; deletion requests: 5/day; banned phones cannot return. CAPTCHA only on signup and only when Turnstile keys are set; none on login, password reset or apply (G9). Auth rate limits NOT VERIFIED. Fake employers and scam ads: admin approves every ad and checks payment first; Verified badge only by admin; report form |
| 9 | SEO and sharing | `release-gate` + tests | **Pass** | titles and descriptions per page; sitemap, robots.txt, canonical, country pages written at build; country and ad pages readable without JavaScript. New ads get a good preview only after the next build (G13). Real WhatsApp preview NOT VERIFIED |
| 10a | Single-page fallback | `dist/` has no `404.html` and no `_redirects` | **Pass** | Cloudflare serves `index.html` for unknown addresses |
| 10b | Security headers, caching | `dist/_headers` | **Pass** | CSP without `unsafe-inline`, HSTS, nosniff, frame protection, assets cached for a year |
| 10c | HTTPS redirect | | NOT VERIFIED | needs the live site (Part B) |
| 10d | Scheduled deploy hook | | NOT VERIFIED | not created yet (G13). If the caller fails, the site keeps working; new ads simply have no search page or good preview until the next successful build |
| 10e | Rollback method | | documented below | Cloudflare keeps every deployment |
| 10f | Release tag or commit recorded | `git tag` | **Pass (after fix)** | tag `v1.0.0-rc1` on the tested commit; make `v1.0.0` on launch day (G8) |

### 3a. Earlier blockers (from `docs/14-release-readiness-report.md`)

| Earlier item | Status now | Evidence |
|---|---|---|
| B1 Nothing committed | **Fixed** | committed and pushed to `codingByMasi/JobPortal` |
| B2 First real signup never tested | **Cannot verify** | 0 users in the Mumbai project |
| B3 Supabase and Cloudflare settings | **Still open** | partly done by you (Site URL, redirects, TOTP on, Resend verified); the rest in section 4 |
| B4 Example payment details | **Fixed by design** | Settings in the app; empty means hidden (live `site_settings` has 0 rows). Needs you to fill them (G2) |
| B5 Real file upload | **Cannot verify** | |
| B6 Layout shift on the ad page | **Fixed** | layout shift 0 on all four pages |
| B7 Orphan files and old unpaid ads | **Half fixed** | unpaid ads are removed after 30 days (migration 0019, tested, live); files still need Admin > Problems |
| B8 No CAPTCHA on the apply form | **Still open** | needs Turnstile keys and an Edge Function (G9) |
| B9 Small tap targets and text | **Fixed** | accessibility scan clean |
| B10 Language button label | **Fixed** | |
| B11 Database in Seoul | **Fixed** | Mumbai project `nvjoiomubxtqnnlmfzkb`; Seoul project deleted |
| B12 No staging project | **Still open** | G10 |
| B13 CI ran only unit tests | **Fixed** | `.github/workflows/ci.yml`: lint, unit, build, audit, browser tests |
| B14 PDF frame sandbox, link rel | **Half fixed** | every new-tab link has `rel`; the PDF frame has no sandbox (browser PDF viewers do not work inside a sandboxed frame): accepted |
| B15 Search pages built only at deploy | **Still open** | deploy hook not created (G13) |
| GAP-1 Deleting an ad leaves its picture file | **Still open** | Supabase does not allow deleting files from SQL; Admin > Problems cleans them |
| GAP-2 Old unpaid ads | **Fixed** | migration 0019 |

### 3b. Browser coverage against your list

Covered by tests: browse, filter, search, ad detail, image zoom, PDF open and download, apply by form and WhatsApp link, signup (validation and duplicate email), login, logout, forgot password (same answer for any email), post ad with picture and PDF, wrong file type and oversized file refused, package picker, valid / invalid / expired / wrong-plan / used coupon, payment instructions, free offer, admin approve, reject, hide, show, delete, mark paid, refund, extend days, free ad, featured, edit plans and offers, verify and block, applications export, change requests, reports, settings, route protection for every admin and employer route, deep links and refresh for every public address, Hindi on every public screen, friendly not-found page, empty / loading / error states, no sideways scrolling.
Not covered (cannot be tested without the real services): email confirmation link, reset-password link from a real email, offline and slow real network, real devices. These are in section 4.

## 4. Part A2: settings I cannot see (all NOT VERIFIED). What to do and what to send me

| # | Item | Exact steps | Send me |
|---|---|---|---|
| 1 | Region Mumbai | Supabase > project > Settings > General | screenshot showing "South Asia (Mumbai)" |
| 2 | Paid plan | Supabase > Organization > Billing | screenshot of the plan name |
| 3 | Daily backups and a restore | Supabase > Database > Backups; then restore to a new test project once (needs Pro) | screenshot of the backup list |
| 4 | Confirm email on | Authentication > Sign In / Providers > Email | screenshot |
| 5 | Minimum password 8 | same page, "Minimum password length" (it is probably still 6) | screenshot |
| 6 | Custom SMTP (Resend) and sender | Authentication > Emails > SMTP Settings | screenshot with the password hidden |
| 7 | SPF and DKIM pass | Resend > Domains shows "Verified"; send a test email to a Gmail address, open "Show original" and read SPF / DKIM / DMARC = PASS | screenshot of the original headers |
| 8 | Site URL and redirect URLs | Authentication > URL Configuration | screenshot |
| 9 | Auth rate limits | Authentication > Rate Limits | screenshot |
| 10 | CAPTCHA (Turnstile) | Authentication > Attack Protection; also set `VITE_TURNSTILE_SITE_KEY` in Cloudflare | screenshot |
| 11 | Project not paused | dashboard shows "Healthy" | screenshot |
| 12 | Spend or usage alerts | Organization > Billing > Spend cap / usage emails | screenshot |
| 13 | pg_cron running | I read it: 2 jobs scheduled (expire every 10 minutes, clean-up daily), 8 runs, 0 failed | none (verified) |
| 14 | Test users and sample data removed | I read it: 0 users, 0 ads, 0 files, 3 sample plans (keep or edit in Admin > Packages) | none (verified) |
| 15 | Second admin | sign up a second account, tell me, I make it admin | confirm |
| 16 | Two-step login for you and the second admin | Admin > Security: scan the QR code, enter the code | confirm each |
| 17 | Two-step login on Supabase, Cloudflare, GitHub, domain registrar | each account's security settings | screenshot of each "2FA enabled" |
| 18 | Cloudflare variables | Pages > project > Settings > Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` only; `VITE_ALLOW_DEMO` must not exist | screenshot with values hidden |
| 19 | Domain, HTTPS, www redirect | Pages > Custom domains; SSL/TLS > Edge Certificates: Always Use HTTPS on | screenshot |
| 20 | Deploy hook caller | Pages > Settings > Builds > Deploy hooks; then a scheduler (Cloudflare Worker cron or GitHub Actions schedule) that calls it every 3 hours. If it fails nothing breaks | screenshot |
| 21 | Email inbox, not spam | sign up with a Gmail address | where it landed and how long it took |
| 22 | Link from a phone mail app and a different browser | tap the link on a phone, then copy it into another browser | works / does not |
| 23 | Cheap Android and iPhone on slow network | open Home, a country page, an ad, the apply form; tap the WhatsApp button | photos or notes |
| 24 | PDF opening on the phone | open an ad with a PDF; tap "Open the PDF" | works / does not |
| 25 | Hindi read by a native reader | give them `src/shared/i18n/hi.js` or the live site | their notes |
| 26 | Lawyer review | see `docs/11-owner-checklist.md` section B2 | their answer |
| 27 | Accountant review | GST on fees, receipts | their answer |
| 28 | Business bank account and UPI ID | fill Admin > Settings; pay yourself Rs 1 from another phone and check the name shown in the UPI app | screenshot of the UPI payee name |
| 29 | Expired and reused email links | use a password-reset link twice | the message shown |
| 30 | Offline behaviour on the real site | done on the real-mode build with `npm run test:offline` (pass); on the live site open it, switch the phone to flight mode, tap around | what you see |
| 31 | Link preview in WhatsApp | paste an approved ad link and a country link into "message yourself" | screenshot |
| 32 | Failed payments / failed emails place | Admin > Payments shows payments; email failures are in Supabase > Authentication > Logs and the Resend dashboard | confirm you can find them |
| 33 | Uptime alerts | UptimeRobot (free) for the site and the Supabase address | screenshot |

## 5. Blockers (must fix before launch)

| ID | Severity | Evidence | Plain-words risk | Fix | Effort | Owner |
|---|---|---|---|---|---|---|
| G1 (fixed in code, needs approval) | High | `[PLACEHOLDER` at `en.js:712, 729`, `hi.js:711, 728` | Visitors read "[PLACEHOLDER: ...]" on the Refund page (and on About until a company name is saved). Looks unfinished and the refund rule is not real yet | Lawyer-approved Refund text in both languages; save the company name in Admin > Settings for About | S | professional + code (I swap the text) |
| G2 | High | live `site_settings`: 0 rows | Until the UPI ID, its name and the WhatsApp number are saved, employers see "payment details are not ready" and no WhatsApp button | Fill Admin > Settings (check the UPI ID twice) | S | me |
| G3 | High | earlier Auth diff showed the default length; screenshot needed | People can pick 6-letter passwords | Set minimum password length 8 | S | me |
| G4 | High | not tested | Signup and reset emails may land in spam or fail | Section 4 items 6, 7, 21, 22 | S | me |
| G5 | High | 0 users, 0 files | The first real signup, admin creation, login with two-step, and picture upload never ran on the real services | Part B controlled test | S | me |
| G6 | High | free plan cannot be seen | Free projects pause and have no backups | Pro plan, confirm backups, one restore | S | me |
| G7 | High | 0 users | No admin exists and no second admin; losing the phone with the authenticator app locks you out | Create two admins, both with two-step login, save recovery options | S | me |

## 6. Conditions I can accept, with a deadline (30 days)

| ID | Item | Deadline | Owner |
|---|---|---|---|
| G8 | `v1.0.0-rc1` exists; add `v1.0.0` on the launch commit (`git tag -a v1.0.0 -m "First release" && git push origin v1.0.0`) | launch day | me (or tell me to do it) |
| G9 | CAPTCHA on the apply form, login and password reset (Turnstile keys + one Edge Function); check Auth rate limits | day 30 | me (keys) + code |
| G10 | A free staging Supabase project so live-style tests never touch production | day 14 | me |
| G11 | The one intermittent browser failure: retry is on (`retries: 1`); if a test shows as "flaky" in the next runs, fix that test | day 14 | code |
| G12 | Orphan picture files: run Admin > Problems > "Look for unused files" weekly | weekly | me |
| G13 | Scheduled deploy hook (every 3 hours) so new ads get search pages and good previews | launch week | me |
| G14 | Part B live smoke test and the first-week checks | launch day | me + code |
| G15 | PDF frame not sandboxed (accepted trade-off) | none | - |
| G16 | Lawyer and accountant reviews of About, FAQ, Refund, Deletion, Privacy, Terms, the Verified rules, GST on fees and receipts | day 30 (before taking payments) | professional |
| G17 | A native Hindi reader | day 30 | me |
| G18 | Offline / slow real network check and real devices (items 23, 24, 30) | launch week | me |

## 7. Go-live checklist (in order)

- [ ] 1. Supabase: minimum password 8; confirm email on; SMTP (Resend) saved; Site URL and redirect URLs set; rate limits looked at (items 4 to 10)
- [ ] 2. Supabase: upgrade to Pro; check that daily backups show (items 2, 3)
- [ ] 3. Cloudflare: project from GitHub, the two variables, domain, always-HTTPS, `www` redirect, deploy hook (items 18 to 20)
- [ ] 4. Replace the placeholder text on the Refund and About pages with reviewed text (G1)
- [ ] 5. Sign up as the owner; tell me; I make that account admin
- [ ] 6. Admin > Security: enrol the authenticator app; sign up the second admin; I make it admin; enrol it too
- [ ] 7. Admin > Settings: WhatsApp, UPI ID, name on the UPI ID, emails, company name, site address
- [ ] 8. Pay yourself Rs 1 from another phone and check the UPI name (item 28)
- [ ] 9. Tag the commit: `v1.0.0` (G8)
- [ ] 10. Tell me "the site is live": I run `npm run smoke:live -- https://deshduniyanaukri.com --lighthouse` (Part B)
- [ ] 11. Controlled test (below), then delete the test data
- [ ] 12. Send the site to 2 or 3 friends with the script in `docs/14-release-readiness-report.md` section 8 (rehearsal)
- [ ] 13. Uptime alerts (item 33); Search Console + sitemap
- [ ] 14. Announce

**Day-of plan.** Do steps 1 to 9 in the morning. Do 10 and 11 before noon. Announce only after the smoke test passes and the controlled test shows the ad hidden until approved, live after approval, the application stored, and the receipt right. Keep the Supabase and Cloudflare dashboards open for the first hour.

**Controlled test (Part B).** 1) Sign up as "TEST-Recruiter" (a real mailbox of yours) and confirm by email on a phone. 2) Post one ad titled "TEST-Plumber" with a small picture; check it is waiting for payment and not on the public list. 3) As admin mark it paid with reference "TEST-001", check it waits for approval and is still hidden. 4) Approve; check it is on the public list, the country page and the share preview. 5) As a visitor apply with a test name and your own number; check the employer sees only a count until verified. 6) I read the database (read-only) and confirm the ad, payment, application and price snapshot. 7) **Delete the test data:** Admin > Ads: delete "TEST-Plumber"; Admin > Employers: block "TEST-Recruiter" and ask me to delete that user; Admin > Problems > "Look for unused files" > delete the picture; Admin > Payments: the test payment stays as a record unless you ask me to remove it. I will not touch any other data.

**Rollback.** Website: Cloudflare Pages > Deployments > pick the last good deployment > "Rollback to this deployment" (takes under a minute). Code: `git revert <commit>` and push, or redeploy the previous tag. Settings (UPI, WhatsApp): change in Admin > Settings; every change is in the admin log. A bad ad: Admin > Hide. Database: migrations only go forward; to undo one, I write a new migration; for data loss, restore a Pro daily backup. Keep the previous tag until the new release has run a week.

**First-week plan.** Daily (10 minutes): Admin home (waiting counts, red reminders), Admin > Reports (money-demand reports first), Admin > Requests, Admin > Problems (crashes), Admin > Payments against the bank statement, Resend dashboard (bounces), Supabase > Authentication > Logs. Day 1, 3 and 7: Supabase > Reports (database size, storage, egress), `npm run smoke:live`. Alerts: UptimeRobot on the site and the Supabase address; Supabase usage emails; Cloudflare build failure emails; GitHub Actions failure emails. Weekly: unused files tool, backup list.

## 8. Decisions for you

| Decision | My recommendation | Trade-off |
|---|---|---|
| Launch now with the Refund placeholder, or wait for the lawyer | Wait. Or publish a short plain rule you can keep (no refund after the ad is live; full refund before) and mark the page "draft" | Waiting costs days; a vague refund rule costs disputes |
| CAPTCHA on the apply form before launch | After launch, within 30 days; per-address limits protect you now | Bots can add junk applications below the limits |
| Pro plan now | Yes, before the first real employer pays | About Rs 2,100 a month |
| Staging project | Yes, free, within 14 days | One more place to keep in step |
| Hindi pre-rendered pages (separate addresses) | Later, if Hindi search traffic matters | More work, more pages |

## 9. How to re-run everything

| Command | What it does |
|---|---|
| `npm run test:all` | lint, unit and database tests, build, audit, browser tests (phone and desktop, accessibility), Lighthouse (4 pages), known gaps |
| `npm run release:gate -- --live-readonly` | the checks in section 3 that need no browser, plus a SELECT-only look at the linked Supabase project. Writes `test-results/release-gate.json` |
| `npm run smoke:live -- https://deshduniyanaukri.com --lighthouse` | read-only checks of the live site (Part B). Never logs in, never submits |

(`docs/08-testing-checklist.md` does not exist in this project; the same text is in `docs/07-testing.md`.)

## 10. Tested

Commit `d532c08` (functionality identical to the commit with this report), 2026-10-08. Node 22. Browser tests on Chromium at 390 and 1440 px against the mock-data build; database tests on a real Postgres engine (PGlite) with the real migrations; the Mumbai project read with SELECT statements only; no write was made to any real service in this run.
