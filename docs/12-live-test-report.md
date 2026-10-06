# 12 - Live test report (real Supabase project)

Date: 2026-10-06. Project: **JobPortal** (`nxdwnmoqtyfosrxbpmze`, region ap-northeast-2). Database set up from `supabase/schema.sql` (migrations 0001 to 0014) and the one-time storage address.

## How it was tested
1. **Setup check (SQL):** tables, security switches, functions, bucket, schedule.
2. **Visitor check (public key, read-only):** what a stranger can read and write through the website's own address. Tool: the same public key the site uses.
3. **Full life-of-an-ad test inside the real database:** `node scripts/live-e2e.mjs` (SQL in `scripts/live-e2e.sql`). It makes 4 test people, then plays visitor, employer, admin, blocked employer and an admin with two-step login: post, pay, approve, apply, verify, change request, reject, fix and resend, hide, refund, block, upload rules, system functions. **Everything is rolled back at the end** (the block ends with an error on purpose). After each run the project was checked: 0 test users, 0 ads, 0 payments, 0 files left.
4. **Website against the live database:** the real site (`npm run dev` with the live `.env`) opened in a browser: home, jobs, post-a-job, signup, forgot password, `/admin` as a visitor. No console errors.

Re-run any time (needs `npx supabase login` and `link` once): `node scripts/live-e2e.mjs`.

## Results
| Area | Checks | Result |
|---|---|---|
| Setup: 8 tables with security on (0 off), 10 functions, public view, 3 packages, 5 newest columns, bucket `job-files` public / 3 MB, storage address, expiry and clean-up scheduled (pg_cron) | 11 | all good |
| Visitor read-only check | 16 | all good (writes and admin calls refused, private tables read nothing) |
| Live end-to-end test | **85** | **85 passed** |
| - 1 signup (always an employer, even if the signup data says admin) | 1 | pass |
| - 2 post ad (outside link replaced by our link, WhatsApp gets 91, price saved, other people's or missing files refused) | 7 | pass |
| - 3 employer limits (cannot go live, set dates, change package or price, make self admin or verified; others cannot see or edit) | 9 | pass |
| - 4 visitor | 3 | pass |
| - 5 payment and approval (reference, saved price, one reference once, no approve before payment, 30 days, no second approve) | 12 | pass |
| - 6 public list (details and thumbnail show, jobs table closed, paid ad cannot be deleted by employer) | 4 | pass |
| - 7 apply (once per phone, bad phone refused, unverified employer sees only a count, verified sees details) | 9 | pass |
| - 8 change requests (max 3 open, only paid own ads, admin closes, time saved) | 7 | pass |
| - 9 reject, fix, send again; unpaid cannot skip payment | 8 | pass |
| - 10 hide, show, refund (and hide), no second refund | 6 | pass |
| - 11 trust (rename removes verified, blocking hides ads, blocked cannot post or upload) | 4 | pass |
| - 12 storage rules | 4 | pass |
| - 13 two-step login on the real Supabase tables | 5 | pass |
| - 14 system functions and admin log | 7 | pass |
| Website against live data | 6 pages | pass: real packages shown, empty list handled, no demo banner, `/admin` sends a visitor to login |

## What broke
**Nothing in the product.** Things that went wrong during testing, all in the test or the set-up, and what we learned:

| What happened | Cause | Fixed / learned |
|---|---|---|
| The first live check showed a different project's data | `.env` pointed to an older project (`vnwykkoqrnfjhnyczckp`), not the JobPortal one, and the logged-in CLI account did not own it | `.env` now points to JobPortal. Always compare the project address in `.env` with `npx supabase projects list` before pushing anything. |
| First run: 84 of 86 | One check tried to delete a file with SQL: the real Supabase refuses SQL deletes in its storage tables ("use the Storage API"). So that check cannot be done in SQL. One check expected 8 admin-log lines, the correct number is 6 | Both checks corrected in `scripts/live-e2e.sql`. The storage delete rule is tested locally and must be hand-checked once through the site (below). |
| The result reader failed once | It read progress text after the results | Fixed in `scripts/live-e2e.mjs`. |
| Visitor "bucket info" check says "Bucket not found" | That call needs a login, so a visitor cannot see bucket details | Normal. The bucket exists (SQL check). |
| Public API description (OpenAPI) returns 401 | The new "publishable" key type does not allow it | Harmless; the site does not use it. |

## What was NOT tested (needs a real login or outside service)
These are the remaining risks. Test them by hand (list in `07-testing.md`, items 13b and 14):
- **Real signup through Supabase Auth**: the confirmation email, "forgot password" email and link, the CAPTCHA, the authenticator-app set-up screen (QR picture and first code). The database side of all of these passed.
- **Real file upload through the Storage API**: the 3 MB limit, the allowed file types, deleting a file you own, and that the browser's upload then matches the database check (path = `<your id>/<name>`). Also whether the picture and its thumbnail show on the ad page.
- **Logged-in screens with a real token**: the employer and admin screens were only tested in demo mode and in the database test, not with a real session. The most likely place for a surprise is the joined queries (an ad with its package and employer, payments with their ad, requests with their ad) under the security rules.
- **The website build with real settings**: the search pages and share pictures (`npm run build` with the real `SITE_URL`), the Netlify build check, the security headers on the live site.
- **Email sender, paid-plan settings, backups, uptime alerts** (dashboard items in `11-owner-checklist.md`).
- Slow-phone speed with real ads and pictures.

## Next steps
1. Do the Supabase dashboard settings (`11-owner-checklist.md`, A).
2. Run `npm run dev` with the live `.env`, sign up as an employer, make yourself admin, post an ad with a picture, mark paid, approve, apply, ask for a change, and delete a file. Write down anything that does not work and send it to me.
3. Re-run `node scripts/live-e2e.mjs` after every database change.

---

# Whole-app end-to-end run (real browser, 2026-10-06)

Method: the real website opened in a browser and driven like a person (typing, ticking, clicking, uploading a picture and a PDF), through every role. It ran in **demo mode** because nothing may create a real account on your live Supabase for you; demo mode has the same screens and the same rules as the real one (a test keeps them in step). The live database was tested separately (85 checks, above) and passed again after the last code change.

| Part | Checks | Result |
|---|---|---|
| 1 Visitor: home, jobs list, search, country filter, ad page, WhatsApp link with country code, Report this ad, apply (consent needed, same phone twice refused), Hindi switch, wrong address, /dashboard and /admin sent to login | 17 | 16 pass; 1 is a demo-data limit (the sample PDF ad has no file, so no PDF button; tested with a real PDF in part 5, passes) |
| 2 Employer: signup rules, empty/short-password messages, registration number, post ad with a big picture (shrunk from 1600 px to 28 KB, small picture 8 KB), details text, package cards, payment screen (ad code, UPI link with 799.00 and the code, WhatsApp message with the code), edit while unpaid | 17 | all pass |
| 3 Admin: find ad by code, first-ad hint, **View ad file**, mark paid needs a reference, one reference once, Payments shows reference and saved price, approve, no second approve, ad appears publicly with small picture, details and +91 number, job seeker applies | 15 | all pass |
| 4 Change requests, verification, applicants: request on a paid ad (3 max, plain message on the 4th), admin counts and closes, verify, applicants visible only after verification, renaming the company removes the tag and hides applicants again | 13 | 11 pass first time; 2 were my wrong numbers (the demo data already has 1 sample request) |
| 5 Reject and fix, PDF, refund, block, security, password reset, Hindi: PDF accepted, Gulf number kept, admin opens the PDF, reject with reason, employer fixes and sends again with no second payment, approve, visitors get the Open-the-PDF button, refund hides the ad, block hides ads and stops posting, Security page, forgot and reset password, new password works, Hindi dashboard | 21 | all pass |
| Browser console | all pages | no errors |
| Phone width (375 px) on 5 screens | 5 | no sideways scrolling |

## What broke in this run
| Found | Where | Fixed |
|---|---|---|
| **A new ad lost its details text and its small picture** (the form sent them, the demo save wiped them). The code that talks to the real database was fine; the demo copy of the rule was wrong, so the unit tests missed it. | `shared/data/demo/recruiter.js` | Yes. New test "a new ad keeps its details text, picture link and small picture". |
| Two checks of mine clicked the wrong button inside a pop-up and reported a false pass | my test driver | Driver now clicks inside the pop-up and checks the stored data, not the words on the page |

Nothing else failed. Test totals now: 244 automated tests, 85 live database checks, about 85 browser checks.

## Still not covered (needs a real login on the real project)
Real Auth emails and links, the CAPTCHA, the authenticator-app QR screen, Storage uploads through the real Storage API, and the logged-in screens with a real session (joined queries under the security rules). These are the first things to hand-check after the dashboard settings (`11-owner-checklist.md`).

---

# Supabase's own checker (Database > Advisors), 2026-10-07

Run from the CLI: `npx supabase db advisors --linked`.

| Finding | Action |
|---|---|
| Security: 9 internal trigger functions could be called from outside | **Fixed**: migration 0015 takes the right away; triggers still fire (tests check both). |
| Security: 2 functions without a fixed search path | **Fixed**: migration 0015. |
| Security: view `public_jobs` is "security definer" (ERROR level) | **Accepted on purpose.** It is how visitors see ads and the verified tag without being able to read the jobs or profiles tables. The tests prove it exposes no owner ids. Do not "fix" it by making it invoker-only without redesigning. |
| Security: `is_admin`, `is_blocked`, `job_accepts_applications`, `employer_may_see_applicants`, `count_my_applications`, and the five `admin_*` functions are callable | **Accepted on purpose.** The security rules themselves call the helpers for every request; each function only answers about the caller, and each `admin_*` function refuses anyone who is not an admin. |
| Performance: 10 rules recalculated "who is asking" for every row | **Fixed** for the table rules (migration 0016). The three file-storage rules stay as they were (see below). |
| Performance: 28 "multiple permissive policies" (for example one rule for the owner plus one for the admin on the same table) | **Accepted.** Only a speed hint, negligible until the tables hold many thousands of rows; merging them would make the rules harder to read and audit. |

## An incident during this work (and how it is prevented now)
While applying migration 0016, the local tests failed on the file-storage rules ("infinite recursion detected in policy" for uploads), but my command chain went on and applied the same change to your live project. For a few minutes employer uploads on the live project would have failed (no real users were affected; the live test showed 84 of 85). I restored the three original storage rules on live at once (85 of 85 again), removed the storage part from migration 0016, and added **`node scripts/live-apply.mjs <migration file>`**: it runs the local tests first and refuses to touch the live project if any fail, then applies the file, then runs the 85-check live test. Use it for every future database change.

---

# Before production: second live run (2026-10-07)
Migration 0017 was applied with `scripts/live-apply.mjs` (local tests first, then the file, then the live test). Live checks are now **98 of 98** (13 new: signup role right, apply flood limit through the real request-header path, scrambled address stored, crash reports counted, crash list closed to visitors and employers, banned phone cannot be reused, new signup with a banned phone starts blocked). Nothing was left in the project afterwards. The migration history is registered, so `supabase db push --linked --dry-run` reports "Remote database is up to date".

One thing could not be proven from here: that Supabase's own login service (role `supabase_auth_admin`) can run the signup trigger after the checker fixes (the CLI login may not switch to that role). So migration 0017 grants it that right explicitly. **Your first real signup is therefore the key hand check**: after it, the employer must appear in Admin > Employers.
