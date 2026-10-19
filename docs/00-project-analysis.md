# 00 - Project analysis (full review)

Date: 2026-10-06. Reviewer role: senior full-stack developer, tech lead and security reviewer.
Scope: whole repo (code, SQL migrations, docs, CI, Netlify settings). **Analysis only. No application code was changed.**

How to read this: short plain words, with the reason each point matters. "ASSUMPTION" = I am guessing or relying on outside facts I could not check from the repo. Severity: Critical (stop everything), High (fix before any real user), Medium (fix before you promote the site), Low (fix when convenient). Effort: S = hours, M = days, L = weeks.

---

## 1. Executive summary

**Overall health: good foundation, not yet ready for real users.** The database rules are strong (I tried 17 attacks on the real rules; the dangerous ones all failed: no employer could become admin, change status/price/expiry, or read another employer's data). The code is small, tidy and well tested. What is missing is mostly **moderation, account recovery, operations and legal items**, not code quality. I found **no Critical** problem and **8 High** ones.

**Top 5 issues**
1. **An ad's file link can point to any website** (SEC-01). Proven by test. An employer can show an image or PDF the admin never checked, and change it after approval.
2. **The admin cannot see the ad before approving it** (FRD-01). The admin list shows no picture; PDFs cannot be previewed at all before an ad is live. Moderation is your main defence against scam ads.
3. **Every paying employer gets all applicants' names and phone numbers, with no verification and no consent text** (FRD-02). A scammer can buy a Rs 299 ad to collect phone numbers of job seekers.
4. **The main WhatsApp button probably breaks for 10-digit numbers** (UX-01), and **placeholder payment details (UPI ID, WhatsApp number) can go live unnoticed** (PAY-01).
5. **No way to reset a password, and the admin account has no second step (MFA)** (AUTH-01, AUTH-02). One forgotten password locks an employer out; one stolen admin password gives away everything.

Also needs a professional's answer before launch: overseas-recruitment rules and applicant data rules (LEG-01, LEG-02).

Counts: 0 Critical, 8 High, 56 Medium, 27 Low (91 findings, see table).

---

## 2. What I did and did not do

I read: all 9 SQL migrations, `schema.sql`, seed files, every file in `src/`, `scripts/`, `docs/`, `CLAUDE.md`, `netlify.toml`, CI, `package.json`.
I ran (nothing inside the repo was changed; `git status` stays clean):
- `npm test` equivalent: **160 of 162 tests pass; 2 fail on this machine** (see T-01).
- A production build, written to a temporary folder outside the repo, to measure bundle size.
- A throw-away script (outside the repo) that uses your own test harness (real Postgres engine with your real migrations) to try 17 attacks and edge cases. Results are in section 8.

I could **not** check: the real Supabase project settings, the deployed site, a real phone, or the content of the `.env` values (I did not open the keys).

---

## 3. Findings table

IDs: PRD product, ARC architecture, DAT data model, SEC security, FRD fraud, PAY payments, FE frontend, UX low-literacy UX, ACC accessibility, PRF performance, CST cost, OPS operations, LEG legal, SEO, TST testing, DOC docs, SCL scalability, AUTH auth.

| ID | Angle | Finding | Evidence | Severity | Effort | Recommendation |
|---|---|---|---|---|---|---|
| SEC-01 | Security | The check that an ad's file link is "our storage" only tests the end of the link, not the website name. A link on any other site (even another Supabase project) passes. Proven: insert accepted. | `0003_jobs.sql:51-53,90-94`, `0009_abuse_limits.sql:28-31` (pattern starts with `%`). Test only tries a link without our path: `scripts/rls.test.mjs:190` | High | S | New migration: require the link to start with your exact project address + `/storage/v1/object/public/job-files/`. Add the missing test. |
| FRD-01 | Fraud | Admin ad list has no picture or link to the file. Images can only be seen by opening Edit; PDFs show only a "PDF" icon. A not-yet-live ad has no public page. So approve/reject can happen without seeing the ad. | `AdminJobs.jsx:97-98` (columns), `FileField.jsx:42-46` (PDF = icon only), `JobDetail.jsx:57` (reads only the public list) | High | S | Add a big "View ad file" button/thumbnail in the admin list and in the approve pop-up (image and PDF link). |
| FRD-02 | Fraud | Any paying employer reads all applicants' name, phone, city, message. Employers are not verified before reading. No consent line on the apply form. Cheapest ad is Rs 299. | `0005_security_policies.sql:72-75`, `MyApplications.jsx`, `ApplyForm.jsx` | High | M | Decide who may see phone numbers (see Decision 1). Add a consent line on the apply form. Show applicants only for ads that are live or recently expired. |
| UX-01 | UX | The ad's WhatsApp number is pre-filled from the employer's profile phone (10 digits). `wa.me` links need the country code. Form accepts 8-15 digits, so `9876543210` is saved and the link is wrong. Help text asking for "country code" will be missed by this audience. | `JobForm.jsx:39,62`, `format.js:35-37`, `mappers.js:61`, `en.js:186`. (ASSUMPTION: wa.me needs full international format; test on a phone.) | High | S | When saving: 10 digits starting 6-9 get `91` in front. Show "+91" box beside the field. Fix existing rows with one SQL update. |
| PAY-01 | Payments | Placeholder values can ship: UPI ID `yourname@upi`, WhatsApp `919999999999`, email `help@example.com`. The build only warns about the `PASTE_` style placeholder (SITE_URL), not these. Employers could pay a wrong UPI ID. | `config.js:4,7,10,22`, `Pay.jsx:60-62` | High | S | Build must fail when UPI_ID, WHATSAPP_NUMBER or CONTACT_EMAIL still hold the example value. Add a test. |
| AUTH-01 | Auth | No "forgot password", no change password, no change email. A forgotten password locks an employer out; only you can fix it in the Supabase dashboard. | `Login.jsx` (no link), no reset call anywhere in `src/` | High | M | Add reset-by-email page (Supabase built-in). Needs working email (CST-02). |
| AUTH-02 | Auth | The admin is a normal email+password login. Taking over that one account = approve, mark paid, read all applicants, delete. No MFA, no second admin, no login alert. | `0001_profiles.sql:72-74`, `is_admin()` `0001:19-22` | High | M | Turn on TOTP MFA for admin; make `is_admin()` require MFA level 2; create a second admin as backup; long unique password. |
| LEG-01 | Legal | Overseas job advertising and recruitment fees are regulated in India (Emigration Act: registered agents, fee limits, licence number shown in ads). The site has no field or check for an agent's registration. Terms only tell candidates to check. **Confirm with a lawyer.** | `en.js` terms points (`termsPoints`), signup has no such field | High | M | Ask a lawyer what you must check and display. Add "Registration number" to signup and to the ad, and an admin checklist. |
| PRD-01 | Product | Rejected ad is a dead end: employer can only delete it. A paid-then-rejected ad has no fix, resubmit or refund path. | `jobStatus.js:16`, `MyAds.jsx:74-78`, `docs/01:26-31` | Medium | M | Allow "Edit and send again" for rejected ads (no new payment). Write a refund rule (Decision 4). |
| PRD-02 | Product | Employer cannot change anything after payment. A wrong WhatsApp number means a paid ad is useless until admin edits. No pause. | `docs/09:#14`, `0005:44-48` | Medium | S | Add "Ask us to change this" WhatsApp button in My ads with the ad ID filled in. |
| PRD-03 | Product | No notice when an ad is approved, rejected or about to expire. Employers must log in to find out. Lost renewals. | no mail or WhatsApp code anywhere | Medium | S | Admin list: "WhatsApp the employer" button with ready text. Later: email via Edge Function. |
| PRD-04 | Product | Prices are shown only after signup, inside the ad form. The Post-a-job page lists 3 steps but no price. | `PostJob.jsx`, `PackagePicker.jsx` | Medium | S | Show packages and prices on `/post-job`. |
| PRD-05 | Product | Blocking an employer does not hide their live ads. Proven: ad stayed public. | probe 4, `admin.js:55-60` | Medium | S | Blocking also hides all their live ads (trigger or admin action). |
| PRD-06 | Product | "Verified" has no written rules, and a verified employer can change company name to look like a famous company. Proven. | `0001:51-66`, probe 7, `en.js:175` | Medium | S | Write a verification checklist. Trigger: changing company name sets `verified` back to false. |
| PRD-07 | Product | No "Report this ad" button. Terms say "WhatsApp us". | `JobDetail.jsx`, `en.js` terms | Medium | S | Button on every ad opening WhatsApp with ad ID filled in. |
| PRD-08 | Product | Refund only changes a label. The ad stays live. No reason, no partial amount, no link to an ad action. Proven. | `admin.js:78-80`, probe 8 | Medium | S | "Refund" asks: also hide the ad? Store a reason. |
| PRD-09 | Product | Employer cannot edit own company name or phone (rules allow it, no screen). | `0005:17-18`, no UI | Low | S | Small "My profile" page. |
| PRD-10 | Product | `draft` status exists in rules and database but is never used. | `jobStatus.js:3`, `0003:25` | Low | S | Remove it or use it. |
| PRD-11 | Product | Unpaid ads stay forever (max 20 per employer). Their files stay too. | `0009:21` | Low | S | Auto-delete unpaid ads and files after 30 days. |
| PRD-12 | Product | No duplicate-ad hint (same WhatsApp, same title). | probe: nothing stops it | Low | S | Admin list shows "3 other ads with this WhatsApp number". |
| ARC-01 | Architecture | Every route is in one bundle, including admin and employer code for visitors. | `App.jsx:1-31`, build: main 398 KB | Medium | S | `React.lazy` for `/dashboard` and `/admin`. |
| ARC-02 | Architecture | Business rules are written 3 times (SQL, Supabase JS, demo JS 675 lines) plus `jobStatus.js`. Tests guard it, but each new rule costs 3x and demo can drift. | `CLAUDE.md` data rule, `shared/data/demo/*` | Medium | M | Move more rules into SQL functions; keep demo small and frozen once Phase 2 starts. |
| ARC-03 | Architecture | Admin actions (reject, hide, refund, verify, block) are direct table writes. No "allowed from this status" rule in the database, no record of who did what. | `admin.js:33-45,55-60,78-80` | Medium | M | One SQL function per admin action, each checking the current status and writing a row to an `admin_log` table. |
| ARC-04 | Done | All 17 migrations are registered in the project's migration history; `supabase db push` reports the project up to date. `scripts/live-apply.mjs` is the safe way to apply new ones. |
| ARC-05 | Architecture | One environment. Your local `.env` points at a real project and is also used by the tests. No staging. | T-01, `docs/06` | Medium | S | Make a second free Supabase project for staging. |
| ARC-06 | Architecture | Demo login passwords ship in the production bundle (the login page imports the demo seed). Harmless today (demo backend is not active) but untidy. | `Login.jsx:9` | Low | S | Load the demo seed only in demo mode. |
| DAT-01 | Data | Deleting an employer deletes their payment records (cascade). Money records must be kept. Proven: payments went to 0. | `0004:9`, probe 6 | Medium | S | `on delete restrict`; "anonymise" instead of delete. |
| DAT-02 | Data | An employer can delete their own paid, live ad. Its applicants disappear and the payment loses its ad link. Proven. | `0005:50-52`, `recruiter.js:21-25`, probe 5 | Medium | S | Employer may delete only unpaid, rejected or expired ads. |
| DAT-03 | Data | No price/days saved with the ad. If you change a package later, "mark paid" charges the new price and approval uses the new days. Proven (Rs 9,999 charged after price change). | `0006:30,55`, probe 14 | Medium | S | Save price and days on the ad at creation (trigger). |
| DAT-04 | Data | Admin can approve an ad in any status, including one never paid; approving a live ad again restarts the full duration (free extension). Proven. | `0006:23-39`, probe 3a/3b | Medium | S | Approve only from "waiting for approval"; a separate, clearly named "free ad" action for exceptions. |
| DAT-05 | Data | One ad can get 2 paid payments through "Add payment". No payment reference (bank UTR) column; the same payment screenshot can be used twice. Proven. | `0004:6-16`, probe 9 | Medium | S | Add `reference` (unique when set) and one-paid-payment-per-ad index. |
| DAT-06 | Data | Visitors can read `recruiter_id`, `package_id`, `file_path` of live ads straight from the `jobs` table. Docs say the view hides them. Proven. | `0005:31-33`, probe 2, `docs/03:13` | Low | S | Remove the visitor read policy on `jobs`; only the view needs to read. |
| DAT-07 | Data | `whatsapp` may be empty in the database (form requires it). `file_type` is not tied to the real file. | `0003:20`, probes 10/13 | Low | S | Require 10-15 digits in the database too. |
| DAT-08 | Data | Missing indexes for later: `payments(job_id)`, `applications(created_at)`, `jobs(country, category)`. | `0003:30-31`, `0004:17,28` | Low | S | Add when lists grow (see SCL). |
| DAT-09 | Data | `profiles.email` is a copy; it can go stale if the login email changes. Admin is found by that email. | `0001:9,72-74` | Low | S | Find admin by id, not email. |
| SEC-02 | Security | Open signup, no CAPTCHA, up to 200 files of 10 MB per account = 2 GB per account. One script can fill the free 1 GB storage and stop uploads for everyone. The 2 MB PDF / 300 KB image rules exist only in the browser. | `0007:8-9`, `0009:42-51`, `Signup.jsx` | Medium (High while on the free plan) | S | Turn on Supabase's built-in CAPTCHA for signup. Lower bucket limit to 3 MB and files per account to 30. |
| SEC-03 | Mostly done | Migration 0017: at most 30 forms an hour and 100 a day per visitor address (a scrambled value is stored, never the address); consent tick; fake phone numbers still possible below those limits. A CAPTCHA on this form still needs an Edge Function. |
| SEC-04 | Security | CSP allows `https://*.supabase.co` for frames and connections: any Supabase project, not only yours. Together with SEC-01 it lets outside content be framed. | `netlify.toml:12` | Medium | S | Replace with your exact project address. |
| SEC-05 | Security | Uploads are checked by declared type only; no look at the real file content; PDFs can be 10 MB via direct API. | `0007:8-9`, `files.js:10` | Low | M | Later: Edge Function check of the first bytes. For now, rely on admin viewing (FRD-01). |
| SEC-06 | Security | Password rules: 8 characters checked in the browser only; server minimum is whatever Supabase is set to (ASSUMPTION: default 6). | `Signup.jsx:35` | Low | S | Set minimum 8 in Supabase Auth settings. |
| SEC-07 | Security | "Confirm email" is advised OFF "for a first test" and may be left off. Then anyone can register with any email. | `docs/06:7` | Medium | S | Turn on before launch; add to the go-live checklist as a required item. |
| SEC-08 | Security | The public view runs with owner rights on purpose. Supabase's checker will warn about it. Fine, but document it. | `0006:6-7` | Low | S | One line in `docs/03`. |
| FRD-03 | Fraud | Payments are marked from a WhatsApp screenshot. A fake screenshot is easy. No reference number to match with the bank statement. | `Pay.jsx`, `en.js:236` | Medium | S | Admin checks the bank/UPI statement and enters the UTR (DAT-05). |
| FRD-04 | Fraud | Recruiter phone and email are not verified; the number in the ad can be anyone's. | `0001`, `JobForm.jsx` | Medium | S | First ad of every new employer: admin calls or WhatsApps the number before approving. |
| FRD-05 | Done | Migration 0017: blocking an employer bans their phone and the WhatsApp numbers of their ads; a new login with a banned phone starts blocked; unblocking forgets it. |
| PAY-02 | Payments | Payment screen shows a UPI ID to copy. No QR, no `upi://` link with amount, no payee name, no ad reference. Hard for this audience; easy to mistype. | `Pay.jsx:57-66`, `payments.js:15-25` | Medium | S | Big "Pay with UPI app" button (`upi://pay?pa=..&am=..&tn=AD-ID`) and a QR image. |
| PAY-03 | Done | Payments CSV for the admin and a printable receipt for the employer (not a tax invoice; GST invoices depend on your accountant). |
| PAY-04 | Payments | Phase 2 plan is sound (one "mark paid" function, webhook, signature check). Missing from the plan: price saved at order time, `failed` status, one-time-only payment id table, reconciliation view, refund webhook. Plan numbering is stale: "migration 0008" already exists. | `docs/08:11` | Medium | M | Update `docs/08` first; list these items. |
| PAY-05 | Payments | A payment gateway would need real policy pages (terms, refund, privacy, contact) to activate, and may treat overseas-job advertising as a restricted category (ASSUMPTION). Current legal pages are drafts. | `en.js:380` | Medium | S | Not needed: no payment gateway is used. Have an alternative (QR-only) ready. |
| FE-01 | Frontend | No timeout or retry for slow networks. A stalled request shows a spinner for a long time. | `JobsContext.jsx`, `useAsync.js`, `client.js:6-8` | Medium | S | 15-second timeout, then the existing error screen with Retry. |
| FE-02 | Frontend | PDF ads are shown in an `<iframe>`. Many phone browsers (notably Android Chrome) do not show PDFs inline: likely an empty box with only a small text link. ASSUMPTION: not tested on a device. | `JobDetail.jsx:108-111` | Medium | S | For PDFs, make "Open the PDF" the main big button; show the first page as an image if you can. |
| FE-03 | Frontend | Same phone-number rule is copied in 3 places (apply form, signup, database). | `ApplyForm.jsx:11`, `Signup.jsx:33`, `0004:23` | Low | S | One shared helper. |
| FE-04 | Frontend | No linter in CI; a code comment mentions an ESLint rule that is not installed. | `useAsync.js:20`, `ci.yml` | Low | S | Add ESLint + `react-hooks` plugin. |
| FE-05 | Frontend | Admin lists load everything; the employer pop-up loads all ads and all payments to show one employer. | `AdminEmployers.jsx:20`, `admin.js:7-9,62-66` | Low | M | Filter on the server when lists grow. |
| UX-02 | UX | Default language is English for everyone. No use of the phone's language. | `LangContext.jsx:11` | Medium | S | Start in Hindi when the phone language is Hindi; make the toggle first-visit visible. |
| UX-03 | UX | Body text is 14 px; help lines, chips, nav labels also 14 px. Buttons are large (52-56 px), but small text is hard for low-literacy and older readers. | `base.css:21,76,97,112,139` | Medium | S | Base 16 px; help text 15-16 px. |
| UX-04 | UX | Employer path is long: signup (4 fields) -> email confirm -> login -> ad form (about 9 fields + file + package) -> pay screen -> WhatsApp -> wait. Many small agents work by WhatsApp. | `Signup.jsx`, `JobForm.jsx`, `Pay.jsx` | Medium | M | Pilot "Send us your ad on WhatsApp, we post it" (Decision 8). |
| UX-05 | UX | Hindi was written by an AI; no native reader has checked it. Package names and employer text are not translated. | `docs/05:17` | Medium | S | Pay one native Hindi reader (about 2 hours) before launch. |
| UX-06 | UX | Hindi speakers who search in Hindi script find nothing (search matches English fields only). | `Jobs.jsx:40` | Low | S | Add Hindi words for categories/countries to the search. |
| ACC-01 | Accessibility | The real content (salary, duties) is inside an image. Screen readers and read-aloud tools get nothing (`alt` is empty on cards). | `JobCard.jsx:24`, `JobDetail.jsx:99` | Medium | M | Add 3 optional text fields to the ad (salary, duties, how to apply); show them under the picture. Helps SEO too. |
| ACC-02 | Accessibility | Tiny decorative text (10 px badge). | `base.css:139` | Low | S | 12 px minimum. |
| PRF-01 | Performance | No thumbnails: list cards load the full ad image (up to about 300 KB each, 5-6 per page). | `JobCard.jsx:24`, `files.js:10` | Medium | M | Make a 400 px thumbnail (about 30 KB) in the browser at upload; show it in lists. |
| PRF-02 | Performance | The whole live list (up to 1000 ads, all columns, not sorted) is fetched on every page load. | `supabase/public.js:10` | Medium | M | Fetch only card columns, 20 per page, sorted on the server. See SCL-01. |
| PRF-03 | Performance | JavaScript is about 176 KB compressed on every first visit (app 119 KB + Supabase library 57 KB) incl. admin code. On slow 3G that is several seconds. | build output (measured) | Medium | S | Split admin/employer code (ARC-01). Optional: use plain `fetch` for the 3 public calls and skip the Supabase library on public pages. |
| PRF-04 | Performance | Hero picture is preloaded on every address, also dashboard pages. | `index.html:17` | Low | S | Preload only on home. |
| PRF-05 | Performance | Image quality may go as low as 0.4 and width 1200 px. Dense ad text may blur. | `compress.js:31-59` | Low | S | Test with 10 real ads; raise the target to 400 KB if text blurs. |
| CST-01 | Cost | Free plan limits are tight for this site (storage 1 GB, traffic 5 GB, pauses after 1 week idle, no backups). See section 6. | arithmetic below | Medium | S | Go paid before first real user (as `docs/06:45` says). |
| CST-02 | Cost | Supabase's built-in email sender is very limited (ASSUMPTION: a few emails per hour). Confirmation and reset emails will fail when several employers sign up. | not in repo | Medium | S | Connect a free SMTP service (Resend, Brevo or similar). |
| OPS-01 | Operations | No backups on free plan; no export of payments; payment rows can be deleted by cascade (DAT-01). | `docs/06:45-47` | Medium | S | Paid plan (daily backups) + weekly automatic dump to your own storage. |
| OPS-02 | Done | Migration 0017 and Admin > Problems: the website reports crashes (short text, page without ids, counted not repeated, 300 new lines a day at most, deleted after 30 days). |
| OPS-03 | Operations | If Supabase is down or paused, visitors see saved ads (good) but opening an ad, applying and login give a vague error. | `JobsContext.jsx`, `friendlyError.js` | Medium | S | Paid plan; add a plain "We are fixing something, try in 10 minutes" notice. |
| OPS-04 | Operations | Database changes cannot be undone; no staging. Netlify can roll back the website only (ASSUMPTION: standard Netlify feature). | `docs/06` | Medium | S | Staging project; write a "how to undo" note in each migration. |
| OPS-05 | Operations | Automatic expiry is a commented-out line. Docs say it runs every 10 minutes. If forgotten, rows stay "live" in the database (site still hides them). | `0006:82-85`, `docs/03:43` | Low | S | Put the schedule in a migration, or fix the doc. |
| OPS-06 | Operations | Search pages are built at deploy time. If the build cannot reach Supabase it silently skips them and still passes. | `prerender.mjs:62` | Low | S | Fail the production build when pages were expected but not written. |
| LEG-02 | Legal | Applicants' personal data (confirm with a lawyer: India's DPDP Act): no consent tick, no retention period, no way to ask for deletion, shared with third-party employers. The privacy page promises use "only for that job". | `ApplyForm.jsx`, `en.js` privacyPoints, `docs/03:67` | Medium | M | Consent line; keep applications 90-180 days then delete; name a contact for deletion requests. |
| LEG-03 | Legal | No terms for employers: no acceptance tick at signup, no rules on prohibited ads (fees, fake jobs), no refund/cancellation policy, no GST/invoice plan. | `Signup.jsx`, `en.js:362-380` | Medium | M | Lawyer + accountant: employer terms, refund policy, GST. |
| LEG-04 | Legal | No named grievance contact or take-down process (confirm if the IT intermediary rules apply to you). Contact page is WhatsApp and email only. | `Contact.jsx` | Medium | S | Named person, email, and a 24-hour takedown promise. |
| LEG-05 | Legal | Public claims contradict each other: search page says "Posting is free" for employers, and privacy page says "We do not collect your name, phone number". Both are wrong. | `pages.mjs:65-66` (STATIC_PAGES) | Medium | S | Correct both texts. |
| SEO-01 | SEO | Job pages and share previews are built only at deploy time. A newly approved ad shared on WhatsApp shows the generic home preview until the next build; ended ads stay indexed until then. Build hook is "optional". | `prerender.mjs`, `docs/06:41` | Medium | S | Supabase Database Webhook -> Netlify build hook after approve/hide, at most once an hour (Netlify build minutes are limited). |
| SEO-02 | SEO | Share preview picture is always the generic hero, not the ad. | `pages.mjs` `jobPageHtml` | Medium | S | For image ads use the ad's own file as `og:image`. |
| SEO-03 | SEO | Google job data never gets its end date: code reads `job.expiry`, the field is called `expiresAt`. | `pages.mjs:48`, `mappers.js:64` | Low | S | One-word fix and a test. |
| SEO-04 | SEO | Unknown addresses return "200 OK" (soft 404). | `public/_redirects` | Low | S | Fine to leave. |
| TST-01 | Testing | Tests read your real `.env`. On this machine 2 of 162 fail, and one test sends a real login to the real Supabase project. CI is fine because it has no `.env`. | `src/shared/data/index.test.js:35-37,51-52` (my run) | Medium | S | Force empty Supabase values in the test config. |
| TST-02 | Testing | Security tests miss: outside-site link with our path (SEC-01), visitors reading `jobs` columns, blocked employer's ads staying public, admin status jumps, applications flood, payment cascade, refund leaving ad live. | `scripts/rls.test.mjs` | Medium | S | Add these 7 tests first (probe script already shows each). |
| TST-03 | Testing | No screen or end-to-end tests. Screens were "hand-checked in demo mode"; the real-project checks in `docs/07` are not yet run. | `vite.config.js:6`, `docs/07:37,42` | Medium | M | One Playwright smoke test on the staging project: signup, post, mark paid, approve, apply. |
| TST-04 | Testing | Supabase's own services (Auth, Storage limits, cron, email) are untested by design. | `docs/03:62` | Low | S | Do the real-project checklist once and keep a dated tick list. |
| DOC-01 | Docs | Small stale facts: "migration 0008" (`docs/08:11`), "162 tests" (`docs/07:4`), "pg_cron runs every 10 minutes" (`docs/03:43`), "view hides owner ids" (DAT-06). | as listed | Low | S | Fix in the same change as the related finding. |
| DOC-02 | Docs | Docs are written for developers. There is no plain daily guide for the admin (approve flow, disputes, refunds, restore from backup, who to call, how to change keys). A non-technical successor cannot take over alone. | `docs/` | Medium | S | Add `docs/10-admin-guide.md` with screenshots and a Hindi copy. |
| SCL-01 | Scalability | Hard cap of 1000 ads, with no sort: at about 1000 live ads (10x) some ads silently vanish in random order. | `supabase/public.js:10` | Medium | M | Server-side paging and filters (section 7). |
| SCL-02 | Scalability | List data per visit grows with ads: at 1000 ads about 450 KB raw (about 100 KB compressed). At 10,000 visits a day that is about 30 GB a month for the list alone. | arithmetic below | Medium | M | Same as SCL-01 plus cache the list at the edge. |
| SCL-03 | Scalability | Admin screens and storage-count checks scan everything. Fine up to thousands of rows. | `AdminEmployers.jsx:20`, `0009:49-51` | Low | M | Page and index later. |

Number check: rows by severity are 8 High, 56 Medium, 27 Low (counted from this table). Many Mediums are small, cheap fixes.

---

## 4. Critical and High findings in plain words

No Critical. Eight High:

### SEC-01 - An ad's file can live on another website
- **What could go wrong:** The rule says "the file link must point to our storage". The check only looks at the end of the link. So `https://any-site.example/storage/v1/object/public/job-files/<your-id>/a.jpg` is accepted. I proved this on your real rules.
- **Real example:** A scammer posts an ad with a clean picture, the admin approves it, then the scammer replaces the picture on their own server with one saying "send Rs 5,000 to this UPI ID". Your admin never sees the change, and your upload limits and file checks are skipped.
- **Fix:** A new migration that demands your exact project address in the link; add the test.

### FRD-01 - The admin approves without seeing the ad
- **What could go wrong:** In the admin list you see title, employer, package, status, but not the ad itself. Images show only inside Edit; PDFs never show before the ad is live.
- **Real example:** A busy admin presses Approve on 20 ads. One is a "visa fee" scam. Every approved scam damages trust in the whole site.
- **Fix:** Show a thumbnail or "View ad" button in the list and in the Approve pop-up.

### FRD-02 - Applicant phone numbers go to any paying employer
- **What could go wrong:** For Rs 299 anyone can open an account, post an ad and read every applicant's name, phone, city and message. There is no consent text on the apply form.
- **Real example:** A fake "recruiter" posts a plumber ad, collects 200 phone numbers of hopeful workers and calls them asking for a "registration fee".
- **Fix:** Decide who may see applicants (Decision 1), add a consent line, delete old applications after a set time.

### UX-01 - The WhatsApp button may not work
- **What could go wrong:** The ad's WhatsApp field starts with the employer's own phone number (10 digits). WhatsApp links need the country code. The form accepts 10 digits and the help text asking for a country code is easy to miss.
- **Real example:** An employer posts an ad; every candidate who taps "WhatsApp" lands on an error. The employer thinks nobody is interested and asks for a refund.
- **Fix:** Add "91" automatically to 10-digit numbers; test on a real phone.

### PAY-01 - Example payment details can go live
- **What could go wrong:** The UPI ID, WhatsApp number and email in `config.js` are examples. Only one placeholder (the site address) is caught by the build.
- **Real example:** You publish on a busy day and forget to edit `config.js`. Three employers pay `yourname@upi`. Money goes to a stranger.
- **Fix:** Make the build stop when these still have example values.

### AUTH-01 - No password reset
- **What could go wrong:** Employers who forget a password cannot recover it by themselves.
- **Real example:** 30 employers in the first month; 5 forget passwords; each WhatsApps you; you reset by hand in the dashboard.
- **Fix:** A "Forgot password" screen using Supabase's built-in email reset. Needs working email (CST-02).

### AUTH-02 - One password protects everything
- **What could go wrong:** The admin account approves ads, marks payments, sees all applicants and can delete anything. It has a single password.
- **Real example:** The same password was used elsewhere and leaks; the attacker approves scam ads and reads every applicant's phone number.
- **Fix:** Turn on MFA (authenticator app) for admin, require it in the database, and make a second admin as backup.

### LEG-01 - Overseas recruitment rules (confirm with a lawyer)
- **What could go wrong:** India regulates who may recruit for jobs abroad and what they may charge. A site that sells ads to unregistered agents may be treated as helping them. The site never asks for registration details.
- **Real example:** An unregistered agent charges candidates Rs 80,000 for a "visa". Authorities ask which platform advertised it.
- **Fix:** A lawyer tells you what must be checked and shown. Then add a registration-number field and an admin checklist.

---

## 5. What is already done well

Real strengths, checked in the code or by running it:

- **Database does the policing.** Row Level Security is on every table; triggers stop employers changing status, package, dates, owner (`0003_jobs.sql:70-97`); signup can only create an employer (`0001:29-43`); admin functions check admin and are closed to visitors (`0006:75-80`). I tried to break these (section 8): no escalation worked.
- **59 real security tests** run your real SQL in a real Postgres engine (`scripts/rls.test.mjs`, `scripts/rls/harness.mjs`). This is rare and valuable. I reused it for my own checks.
- **No secrets in the repo.** Only the public key is used; `.env` is ignored; `git grep` for service keys found nothing.
- **Strict web headers.** No inline scripts or styles allowed, framing blocked, `nosniff` (`netlify.toml:12-16`).
- **Safe display.** No raw HTML anywhere, spreadsheet-formula protection in CSV (`csv.js:6`), only https links (`safeUrl.js`), build-time pages escape text (`pages.mjs`).
- **Upload hygiene in the browser.** Pictures are re-drawn and shrunk (removes hidden data), PDFs capped at 2 MB, files go only in the user's own folder.
- **Abuse limits already thought of.** 20 unpaid ads, 200 files, 1000 applications per ad, one application per phone, row lock in mark-paid.
- **Friendly for the audience.** Plain error words, loading/empty/error screens everywhere, Hindi key-match test, 52 px taps, big focus ring (`base.css:39`), reduced-motion, pinch-zoom viewer (`base.css:157-158`), clean axe scans, cached list for slow networks, system fonts, fast hero image, long-lived asset cache.
- **Simple, tidy code.** Small files, one-line headers, one-way imports, one data door (`shared/data`), money in paise, a ready Phase 2 seam (`startPayment`).
- **A published site without keys shows a "not ready" page, never fake data** (`env.js`).
- **Good docs and rulebook** (`CLAUDE.md`, nine topic docs, changelog). The rules in CLAUDE.md are followed (files under 200 lines, no words in components, tests next to code).

---

## 6. Cost and limits (arithmetic, step by step)

**Assumptions (change them and redo the sums):**
- Free plan (ASSUMPTION, verify on the Supabase pricing page; numbers change): database 500 MB, file storage 1 GB, traffic 5 GB a month, pauses after about 1 week idle, no backups. Pro plan (about 25 US dollars, roughly Rs 2,100 a month): 8 GB database, 100 GB storage, 250 GB traffic, daily backups kept 7 days, extra traffic about 0.09 dollars per GB.
- Average ad file: 80% pictures at 250 KB, 20% PDFs at 1 MB. Average = 0.8 x 0.25 + 0.2 x 1.0 = **0.4 MB**. Add 50% for renewals (each renewal copies the file), rejected and unpaid ads, replaced files: **0.6 MB per ad posted**.
- A database row for an ad is about 1 KB with indexes; an application about 0.5 KB; each ad gets about 30 applications.
- One visit = the ad list plus about 8 list pictures plus 1 opened ad = 9 pictures x 0.25 MB = about 2.2 MB. I use **2 MB per visit**, no browser-cache saving (careful estimate).

**Storage.** 1 GB = 1,024 MB. 1,024 / 0.6 = about **1,700 ads in total**. At 100 ads a month: 17 months. At 300 a month: 5.7 months. At 1,000 a month: 1.7 months. Pro (100 GB): about 170,000 ads. Danger is not normal use but abuse (SEC-02): 200 files x 10 MB = 2 GB from one account.

**Database.** 1,000 ads a month: 1,000 x 1 KB = 1 MB. Applications: 1,000 x 30 x 0.5 KB = 15 MB. About 16 MB a month. 500 MB / 16 MB = about **30 months**. The database is not the limit.

**Traffic.** Free: 5 GB / 2 MB = **2,500 visits a month, about 83 a day**. Pro: 250 GB / 2 MB = 125,000 visits a month, about 4,100 a day. At 10,000 visits a day: 300,000 x 2 MB = 600 GB; 350 GB over the Pro amount x 0.09 dollars = about 31 dollars (Rs 2,700) extra. With 30 KB thumbnails (PRF-01): 8 x 0.03 + 1.5 x 0.25 = about 0.65 MB per visit, so the same plans carry about 3 times more visits (free 7,700 a month, Pro about 385,000). ASSUMPTION: Supabase may count cached file traffic separately, which would help.

**Website host (Netlify).** First visit transfers about 0.3 MB (app 176 KB compressed + CSS 5 KB + hero 45-112 KB). 30,000 visits x 0.3 MB = about 9 GB a month. ASSUMPTION: well inside current free limits, but Netlify changed to credit-based plans, so check. Builds: if you rebuild for every approval (SEO-01) at 50 approvals a day, 50 builds x about 1 minute = 1,500 minutes a month, far above a typical free build allowance. So rebuild at most once an hour.

**When to pay.** Before the first real user (backups, no pausing, as `docs/06:45` says). The Pro plan costs about the same as **3 ads of Rs 799 a month**. Move on to higher tiers only when storage passes 70 GB or traffic passes 200 GB.

**Other costs (estimates, confirm):** domain Rs 700-1,200 a year; email sender free tier; a payment gateway would charge about 2% plus tax per payment (not used); Plausible analytics is paid (about 9 dollars a month); WhatsApp links are free; a lawyer, an accountant and a native Hindi reader are one-time costs.

---

## 7. Scalability: what breaks first

Baseline = 100 live ads, 1,000 visits a day. 10x = 1,000 ads, 10,000 visits. 100x = 10,000 ads, 100,000 visits.

| Stage | What breaks | Cheapest fix |
|---|---|---|
| Today | Nothing. | - |
| 10x | The 1000-ad cap is reached; some ads vanish in random order (`public.js:10`). The list JSON costs about 30 GB a month. Pictures cost 600 GB a month without thumbnails. Admin screens slow down. | Server-side paging (20 per request) and thumbnails. Both are small changes to `listLiveJobs`, the Jobs screen and the upload step. |
| 100x | Phone-side filtering and search no longer work on 10,000 ads. Netlify rebuild with 1000+ pages gets slow. | Server-side filters (and later Postgres text search), cache the list at the edge (one small JSON per country), keep only the newest 1,000 job pages prebuilt. |
| Any | Spam on the apply form and signup grows with visits. | CAPTCHA (SEC-02, SEC-03). |

---

## 8. Attacks and checks I ran (on your real rules, in the test engine)

| # | Try | Result |
|---|---|---|
| 1 | Employer saves a file link on another website that ends with our path | **Allowed** (SEC-01) |
| 2 | Visitor reads `recruiter_id`, `package_id`, `file_path` from `jobs` | **Allowed** (DAT-06) |
| 3a | Admin approves an ad that never paid | Allowed (DAT-04) |
| 3b | Admin approves a live ad again | Duration restarts to the full 30 days (DAT-04) |
| 4 | Blocked employer's live ads | Still public (PRD-05) |
| 5 | Employer deletes own paid live ad | Allowed; applicants gone, payment loses ad link (DAT-02) |
| 6 | Delete an employer | Payment records deleted (DAT-01) |
| 7 | Verified employer renames company | Allowed, stays verified (PRD-06) |
| 8 | Refund a payment | Ad stays live (PRD-08) |
| 9 | Two paid payments for one ad | Allowed (DAT-05) |
| 10 | `file_type = pdf` with no real file | Allowed (DAT-07) |
| 11 | 50 fake applicants, new phone each | 50 of 50 accepted (SEC-03) |
| 12 | Visitor reads inactive packages | Allowed by rule (low) |
| 13 | Ad with empty WhatsApp | Allowed (DAT-07) |
| 14 | Change package price, then mark paid | New price used (DAT-03) |
| - | Employer makes self admin / changes status, package, dates / writes payments / reads others' data | **Blocked** (covered by the existing 59 tests, and re-read in the SQL) |

---

## 9. Assumptions and what I could not verify

- Real Supabase settings: "Confirm email", password minimum, MFA, SMTP, pg_cron schedule, backups, the bucket, which project the `.env` points to. I did not open the key values.
- Supabase free/Pro limits and Netlify limits: from memory, may be out of date (section 6).
- Supabase default email limit: from memory.
- `wa.me` behaviour with 10-digit numbers, and PDF-in-frame behaviour on phones: from known browser behaviour, **not tested on a device**.
- A payment gateway's acceptance of this category: unknown (no gateway is used).
- Indian rules (Emigration Act, data protection law, intermediary rules, GST): named only so you can ask a professional. **This is not legal advice.**
- Hindi quality: not judged by me.
- No performance test on a real slow phone; bundle sizes are measured, load times are estimates.
- Netlify HSTS and rollback: assumed to be platform defaults.
- I did not test the deployed site, the prerender step against a live Supabase, or any Supabase service (Auth, Storage, cron).

---

## 10. Recommended fix order

**Manual payments are real money from day one, so money safety items are in Phase 1.**

### Phase 1 - before any real user
1. SEC-01 file link host (+ TST-02 test), FRD-01 admin sees the ad, PRD-07 report button.
2. UX-01 WhatsApp number fix, PAY-01 placeholder guard, TST-01 tests ignore `.env`.
3. AUTH-01 password reset, CST-02 real email sender, SEC-07 confirm email on, SEC-06 password minimum, SEC-02 CAPTCHA on signup + lower file limits, AUTH-02 admin MFA + second admin.
4. CST-01 / OPS-01 paid plan and backups, DAT-01 and DAT-02 (no accidental loss of money records or applicants), DAT-05 payment reference, PRD-05 block hides ads, PRD-06 verification rules.
5. FRD-02 applicant access decision + consent line, LEG-01 to LEG-05 (lawyer, accountant, fix public wording), UX-05 Hindi review, UX-02 Hindi default.
6. OPS-02 error logging and uptime check, SEO-01 automatic rebuild, FE-01 timeout, DOC-02 admin guide.

### Phase 2 - before promoting widely or taking online payments
- PRF-01 thumbnails, PRF-02 / SCL-01 paging, ARC-01 / PRF-03 smaller first load, FE-02 PDF handling, UX-03 text size, SEC-03 apply CAPTCHA, SEC-04 CSP pinned.
- DAT-03 saved price, DAT-04 status rules, ARC-03 admin functions with a log, PRD-01 / PRD-08 reject and refund flow, PAY-02 UPI link and QR, PAY-03 receipts and export.
- PAY-04 / PAY-05 update `docs/08`; TST-03 end-to-end test; ARC-04 / ARC-05 / OPS-04 staging and migration tracking; SEO-02, SEO-03.

### Phase 3 - later
ACC-01 structured text on ads, UX-04 post-for-you service, UX-06 Hindi search, PRD-02/03/09 to 12, FRD-05, DAT-06 to DAT-09, SEC-05, FE-03 to FE-05, ARC-02, ARC-06, PRF-04, PRF-05, OPS-05, OPS-06, SCL-03, TST-04, DOC-01.

---

## 11. Decisions for you (product owner)

| # | Decision | My recommendation | Trade-off |
|---|---|---|---|
| 1 | Who sees applicants' phone numbers? | Only verified employers whose first ad you approved; others see a count, and you forward details. | More work for you vs far less misuse of job seekers' data. |
| 2 | Verify employers before their first ad? | Yes: call or WhatsApp the number and, for agents in India, check the registration number (after the lawyer confirms). | Slower start, far fewer scam ads, better legal position. |
| 3 | Rejected ad: what can the employer do? | Free edit and resubmit once; if still rejected, refund. | Fair, but costs admin time. |
| 4 | Refund rules | Full refund if rejected; none once live; written on the payment screen and in terms. | Fewer disputes vs a few angry employers. |
| 5 | Auto-approve after online payment (Phase 2)? | No for new employers; yes for verified repeat employers. | Speed vs moderation. |
| 6 | Can employers edit live ads? | No; use "Ask us to change this". | Keeps what you approved vs convenience. |
| 7 | Default language | Hindi when the phone is set to Hindi; big toggle. | Some English users must tap once. |
| 8 | "Send us your ad on WhatsApp, we post it" service | Pilot it at a higher price. | Admin time vs many more employers who will not use forms. |
| 9 | Paid Supabase plan from day one | Yes (about Rs 2,100 a month, about 3 ads). | A fixed cost before income. |
| 10 | Show prices publicly on Post-a-job | Yes. | Competitors see them; employers trust you more. |
| 11 | How long to keep applications | 90-180 days, then delete (lawyer confirms). | Less data risk vs employers losing old lists. |
| 12 | Payment gateway risk | No gateway is used; payment is UPI + QR + proof. | A small delay vs a blocked Phase 2. |
| 13 | Who is the named grievance contact? | You, with a phone/email shown on Contact. | Public responsibility, but required trust signal. |

---

## 12. Do not start fixing yet

This file is the only thing added. Tell me which items to fix first (by ID, or "Phase 1 items 1 and 2") and I will plan it in plain words, then do one step at a time and wait for your "go", as `CLAUDE.md` asks.


---

## 13. Status after the fixes (2026-10-06)

Everything that could be done in code was done. "Owner" = needs your accounts, money or a professional: see `11-owner-checklist.md`. Counts: see `CHANGELOG.md`, Step 6.

| ID | Status | What was done / what is left |
|---|---|---|
| SEC-01 | Done | Migrations 0010 and 0012: the database builds the file link; any typed-in link is ignored. 6 tests. |
| FRD-01 | Done | Admin list: View ad file button (picture or PDF link); also in the approve flow. |
| FRD-02 | Done (rule ON by default) | Migration 0014: applicants' names/phones only for verified employers; consent tick on the apply form; applications deleted after 180 days. Switch in `app_settings`. |
| UX-01 | Done | `phone.js` adds 91 to 10-digit numbers; the database also does it and requires 10-15 digits. |
| PAY-01 | Done | `scripts/checkConfig.mjs` stops the Netlify build on example values (also UPI name, complaints contact). |
| AUTH-01 | Done in code - owner: SMTP | Forgot password and reset pages. Needs your email sender in Supabase (CST-02). |
| AUTH-02 | Done in code - owner: turn it on | Migration 0013 + Admin > Security. You must enrol and create a second admin. |
| LEG-01 | Texts and field done - owner: lawyer | Registration-number field (signup, profile, admin list), employer rules, admin checklist. A lawyer must say what to check and display. |
| PRD-01 | Done | Rejected ad: edit and "send again" without paying again (a database rule allows exactly that status change). |
| PRD-02 | Done | Change requests (migration 0011). |
| PRD-03 | Partly | Admin "WhatsApp them" button on ads, requests; no automatic email/WhatsApp messages. |
| PRD-04 | Done | Prices on Post-a-job. |
| PRD-05 | Done | Blocking hides live ads. |
| PRD-06 | Done | Verified resets when company name or registration number changes; checklist in the admin guide. |
| PRD-07 | Done | Report this ad button (WhatsApp with the ad code). |
| PRD-08 | Done | Refund can hide the ad (checked function, logged). |
| PRD-09 | Done | "My details" page. |
| PRD-10 | Not done | `draft` status left in place; it is harmless. Remove later if you wish. |
| PRD-11 | Not done | Old unpaid ads (and their files) are not deleted automatically; the 20-ad limit bounds it. |
| PRD-12 | Done | Admin hint: other ads with the same WhatsApp number. |
| ARC-01 | Done | Employer and admin screens load on demand. |
| ARC-02 | Not done (by choice) | Rules still exist in SQL, Supabase JS and demo JS; a new test checks that both backends have the same function names. |
| ARC-03 | Done | Admin functions with status checks and `admin_log`. |
| ARC-04 | Partly | `06-deploy.md` says to run only newer files; no tracking table (use the Supabase CLI later). |
| ARC-05 | Owner | Make a free staging Supabase project. |
| ARC-06 | Done | Demo logins load only in demo mode. |
| DAT-01 | Done | Payments kept (`on delete restrict`). |
| DAT-02 | Done | Employers delete only unpaid, rejected or ended ads. |
| DAT-03 | Done | Price and days saved with the ad. |
| DAT-04 | Done | Approve only from waiting-for-approval or rejected; ended ads are renewed instead. |
| DAT-05 | Done | Payment reference (unique, any letter case) and one paid payment per ad. |
| DAT-06 | Done | Visitors no longer read the `jobs` table. |
| DAT-07 | Done | WhatsApp rule in the database; file type from the file name. |
| DAT-08 | Done | Indexes added. |
| DAT-09 | Not done | Low: admin is still found by email only in the one-time set-up SQL. |
| SEC-02 | Partly - owner: Turnstile | Limits lowered (3 MB, 100 files); optional Turnstile on signup (needs your keys, `06-deploy.md` A.8). |
| SEC-03 | Not done | The apply form still has no CAPTCHA (needs an Edge Function). Consent tick added; phone numbers still unverified. Documented. |
| SEC-04 | Done | Headers written at build time, naming only your project. |
| SEC-05 | Accepted | Uploads still checked by declared type; the admin now sees every ad before approving. |
| SEC-06 | Owner | Set minimum password 8 in Supabase. |
| SEC-07 | Owner | Confirm email ON (in the deploy guide and checklist). |
| SEC-08 | Done | Documented in `03-database-security.md`. |
| FRD-03 | Done | Reference number is required in the Mark-paid pop-up and is unique. |
| FRD-04 | Done | "First ad of this employer" hint; the admin guide says to call them. |
| FRD-05 | Not done | No blocked-contacts list. |
| PAY-02 | Partly | "Pay with my UPI app" link with payee, amount and ad code; no QR picture. |
| PAY-03 | Partly | Payments CSV; no printable receipt (invoice depends on your accountant). |
| PAY-04 | Done | `08-phase2-payments.md` updated. |
| PAY-05 | Owner | Not needed: no payment gateway is used. |
| FE-01 | Done | 20-second request limit (90 for files). |
| FE-02 | Done | PDF: big "Open the PDF" button; the in-page PDF only on wide screens. |
| FE-03 | Done | One phone helper. |
| FE-04 | Not done | A linter needs a new development library (needs a written reason in `09-decisions.md`). |
| FE-05 | Not done | Admin lists still load everything (fine for the first thousands). |
| UX-02 | Done | Hindi for Hindi phones. |
| UX-03 | Done | Base text 16 px, help 15 px. |
| UX-04 | Not built | Decision for you: "send us your ad on WhatsApp" service. |
| UX-05 | Owner | Native Hindi review. |
| UX-06 | Done | Search also matches the kind-of-work words in the current language. |
| ACC-01 | Done | Optional "More about the job" text shown under the picture (also used for search pages). |
| ACC-02 | Done | Smallest text 12 px. |
| PRF-01 | Done | About 40 KB list pictures made in the browser at upload. |
| PRF-02 | Partly | Sorted on the server; paging deferred (see SCL-01). |
| PRF-03 | Partly | First load 115 KB compressed (was 119) plus the database library 58 KB; admin and employer code now load on demand. |
| PRF-04 | Done | Hero preload removed. |
| PRF-05 | Done | Picture target 400 KB, quality floor 0.5. |
| CST-01 | Owner | Paid plan. |
| CST-02 | Owner | Own email sender. |
| OPS-01 | Partly - owner: secrets | Weekly encrypted backup workflow added; needs two GitHub secrets and the paid plan. |
| OPS-02 | Not done | Needs a service decision (Sentry or similar). |
| OPS-03 | Not done | No "we are fixing something" banner yet. |
| OPS-04 | Partly | Staging project is yours to make; undo notes not added to migrations. |
| OPS-05 | Done | Migration 0012 schedules the jobs when pg_cron exists; deploy guide shows how to check. |
| OPS-06 | Done | The Netlify build stops if the search/share pages cannot be written. |
| LEG-02 | Done - owner: lawyer | Consent tick, 180-day deletion, privacy text rewritten. |
| LEG-03 | Draft done - owner: lawyer, accountant | Employer rules in Terms, tick at signup, refund rule (draft). GST/invoices need your accountant. |
| LEG-04 | Done - owner: fill in | Named complaints person on the Contact page (set in `src/config.js`). |
| LEG-05 | Done | Public wording fixed. |
| SEO-01 | Owner | Hourly Netlify build hook (`06-deploy.md` E.5). |
| SEO-02 | Done | Share preview uses the ad's picture. |
| SEO-03 | Done | Google job data now has the end date. |
| SEO-04 | Left | Unknown addresses still return 200. |
| TST-01 | Done | Tests ignore `.env`. |
| TST-02 | Done | New security tests for every new rule. |
| TST-03 | Not done | No end-to-end browser test yet (needs a staging project). |
| TST-04 | Owner | Do the real-project hand checklist once. |
| DOC-01 | Done | Docs updated. |
| DOC-02 | Done | `10-admin-guide.md`. |
| SCL-01 | Partly | Ordering fixed; server-side paging still to do before about 500 live ads. |
| SCL-02 | Partly | Small list pictures; the list data itself is unchanged. |
| SCL-03 | Not done | Fine until thousands of rows. |

Summary: 91 findings. Done in code: 61. Partly done: 9. Needs the owner or a professional: 9. Not done, accepted or left on purpose: 12 (each with its reason above). Hosting was also moved to Cloudflare Pages (`AUDIT_REPORT.md`, `13-cloudflare-pages.md`).
