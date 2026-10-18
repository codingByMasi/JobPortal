# 03 - Database and security

Source of truth: the numbered files in `supabase/migrations` (0001 to 0022). Put a new file on the live project only with `node scripts/live-apply.mjs <file>` (tests first, then the file, then the live test). `supabase/schema.sql` is generated from them (`npm run schema`); a test fails if it is out of date. Never edit a migration that has already been run on a real project: add a new one.

## Tables
| Table | Holds | Notes |
|---|---|---|
| `profiles` | one row per login: role (`admin`/`recruiter`), company, phone, registration number (`ra_number`), `verified`, `blocked` | created by a trigger at signup, always as `recruiter` |
| `packages` (plans) | name, `price_paise`, `duration_days`, `featured`, `active`, **description, `sort_order`, `badge_text`, `max_files`** | visitors and employers read only plans that are ON, plus the plan of their own ads; a plan that has ads cannot be deleted (a trigger refuses; turn it off); every change goes to `audit_log` (0018) |
| `offers` | name, `type` (`percent`/`flat`/`bonus_days`/`free`), `value` (percent, paise, or days), `applies_to` (`all`/`package`/`recruiter`) + `package_id`/`recruiter_id`, optional `coupon_code` (unique, any case), start/end, `max_uses`, `max_uses_per_recruiter`, `active` | admin writes; an employer reads only ON offers with no code that are for everyone or one plan, and offers made for them; never another offer's coupon code (0018) |
| `offer_redemptions` | offer, employer, ad, discount (paise), bonus days | written only by `create_ad_order`; admin reads all, an employer reads their own; deleting an unpaid ad gives the use back (0018) |
| `audit_log` | admin, action (insert/update/delete), table, record, old value, new value | filled by triggers on `packages` and `offers`; admin reads; nobody writes through the website (0018) |
| `jobs` | the ads (**also the job facts (`salary_min`, `salary_max`, `currency`, `experience_level`, `vacancies`, `last_date`, `visa_type`: all optional, with value checks) and the price saved at order: list price, discount, final price, offer, final days, and an admin "featured" override**): owner, package, title, company, country, city, category, details text, file link/path/type, thumbnail link/path, WhatsApp, dates, `status`, `reject_reason`, **price and days saved at order time** | country and category limited by CHECKs; WhatsApp is 10-15 digits |
| `payments` | amount (paise), method (`manual`/`razorpay`/`free_offer`/`complimentary`), status (`created`/`paid`/`refunded`), note, **reference (UTR)**, **the same price snapshot as the ad** | only admin functions write; reference is unique; one paid payment per ad; kept even if the employer is removed |
| `applications` | candidate name, phone, city, message | no login to insert; one per ad per phone, at most 1000 per ad; deleted after 180 days |
| `change_requests` | an employer asks us to change a paid ad (message, `open`/`done`/`declined`) | migration 0011 |
| `admin_log` | who did what (approve, reject, hide, show, mark paid, refund) | written only by the admin functions; read only by admins |
| `blocked_contacts` | last 10 digits of phone numbers of blocked employers | filled and emptied by the block / unblock trigger; admin only (0017) |
| `error_log` | crashes reported by the website: message, page, how many times | anyone can report through a function (limited); only admins read (0017) |
| `reports` | a visitor reports a live ad: reason (`asked_money`, `fake_company`, `wrong_details`, `other`), short message, optional phone, status (`open`/`done`/`dismissed`), scrambled address | anyone may insert for a live ad (once per ad and 10 an hour per address); only admins read or change; deleted with the ad; closed ones forgotten after a year (0020) |
| `deletion_requests` | someone asks us to delete their account and data: email, note, status | anyone may insert (one open request per email, 5 a day per address); only admins read or change; an admin must check that the writer owns the email (0020) |
| `site_settings` | WhatsApp number, UPI ID, name on the UPI ID, contact email, complaints person and email, company name, site address (one row per setting) | public ones readable by everyone; the UPI ID and its name only by logged-in people; nobody writes the table directly: only `admin_save_settings()` (admin only) writes, checks each value and logs old and new value in `admin_log` (0021) |
| `guides` | the four guides (admin, employer, job seeker, features) as text | only admins read them; nobody writes through the website; published with `npm run guides:publish` (0022) |
| `app_settings` | private settings: `storage_base` (our storage address), optional `applicants_need_verified` | no browser access at all; set in the SQL editor |
| view `public_jobs` | live, not-ended ads + `featured` + `recruiter_verified` + the employer's registration number **only when admin has verified the employer** + the job facts + thumbnail + details | the ONLY way visitors read ads; hides owner ids and internal fields |

## Who can do what (Row Level Security)
| | Visitor | Recruiter | Admin |
|---|---|---|---|
| Read ads | only through the view `public_jobs` (live and not ended); **not the `jobs` table** | + their own ads | all |
| Create ad | no | yes, forced to `pending_payment`, active package required, not blocked, price and days saved | yes |
| Change ad | no | own ad only while `pending_payment` **or `rejected`**; cannot change `status`, `package_id`, dates, owner, saved price (trigger). The only status change allowed: `rejected` -> `paid_pending_review` (with the reason cleared) = "send again" | yes |
| Delete ad | no | own ad only when **unpaid, rejected or ended** (a paid, live or hidden ad cannot be deleted) | any |
| Payments | no | read own; cannot write | read; write only through functions |
| Applications | insert only for a live ad | read for own ads **only when verified** (otherwise only a count) | all |
| Change requests | no | add for own ad past "waiting for payment" (max 3 open per ad), read own, never change or delete | all |
| Packages | read | read | write |
| Profiles | no | read/edit own company name, phone, registration number (trigger blocks role, verified, blocked, email; changing company name or registration number sets `verified` back to false) | all |
| Files | read by link | upload/delete only inside `<own user id>/` | all |
| Admin log, settings | no | no | log: read |

## Extra locks
- **The file link is built by the database (0010, 0012).** Whatever link the browser sends is ignored and replaced by `<storage_base>/storage/v1/object/public/job-files/<file_path>`. The file (and the thumbnail) must exist in our bucket, inside the employer's own folder. The file type (`image`/`pdf`) comes from the file name. So no link to any other website can ever be stored by an employer. Until `storage_base` is set, ads with a file cannot be saved.
- Storage bucket `job-files`: public read by link, **3 MB** limit, only JPG/PNG/WebP/PDF, no folder listing for others, at most **100** files per employer (0012).
- **Admin actions are database functions that check who calls them, the status of the ad, and write a log line (0012):** `admin_approve_job` (only from "waiting for approval" or rejected; uses the days saved with the ad), `admin_mark_paid` (only unpaid ads; uses the price saved with the ad; takes the payment reference), `admin_reject_job` (only ads waiting for approval; reason needed), `admin_set_hidden`, `admin_refund_payment` (can hide the ad). All are closed to visitors.
- **Admin two-step login (0013):** an admin who turned on the authenticator app (Admin > Security) is treated as a normal employer unless the current login used the code (`aal2`). An admin who has not turned it on keeps working, so nobody is locked out during set-up.
- Blocked employers cannot insert ads, edit waiting ads, upload files or add change requests. **Blocking hides all their live ads** (0012).
- WhatsApp number: 10-15 digits; a 10-digit Indian mobile number gets `91` in front by a trigger.
- **Applicant details only for verified employers (0014).** An unverified employer sees only how many people applied (`count_my_applications()`). To turn the rule off: set `applicants_need_verified` to `false` in `app_settings`.
- **Abuse limits:** at most 20 ads waiting for payment per employer; at most 100 files per employer; at most 1000 applications per ad; one application per ad per phone (last 10 digits); change requests max 3 open per ad; profile text length limits; applications older than 180 days are deleted (`cleanup_old_data()`).
- Money records are kept: an employer who has payments cannot be deleted (`on delete restrict`).
- The `expire_jobs()` and `cleanup_old_data()` functions cannot be called from a browser. Migration 0012 schedules both with pg_cron when it is available (expiry every 10 minutes, clean-up daily); otherwise see `06-deploy.md`, step D.
- **Apply form limits (0017):** at most 30 forms an hour and 100 a day per visitor address (the address comes from the request headers and only a scrambled value is stored). Generous on purpose: many phones on one mobile network share one address.
- **Blocked contacts (0017):** blocking an employer also bans their phone and ad WhatsApp numbers; no other login can post with them and a new signup with a banned phone starts blocked.
- **Error log (0017):** `log_client_error()` is open to visitors but cut short, counted per page, capped at 300 new lines a day and cleaned after 30 days.
- Internal trigger functions cannot be called from outside (0015); the table rules use `(select auth.uid())` so the caller is worked out once per request (0016).
- The public view `public_jobs` is read-only for everyone. It runs with owner rights on purpose (so visitors can see the verified tag without reading `profiles`); Supabase's checker may warn about it, which is expected.

## Prices and offers (migration 0018)
- **Price rule in one place:** `quote_price(package, coupon)` (what the website calls) and its internal twin `quote_price_for(employer, package, coupon)` (not callable from the website; Phase 2's order function calls it). It checks: plan is ON; offer is ON; dates; total and per-employer limits; plan match; employer match. No code: the single best automatic offer (never several). A code replaces the automatic offer. Percent = rounded share of the list price; flat is capped at the price; free = whole price; bonus days add days at the same price. The final price is never below 0. The answer carries a short `code` (`not_found`, `inactive`, `not_started`, `expired`, `wrong_plan`, `wrong_recruiter`, `used_up`, `already_used`, `plan_unavailable`) that the website turns into plain words in English and Hindi.
- **`create_ad_order(job, package, coupon)`** (own waiting ad only): takes a lock so offer limits hold when two orders come together; gives back an earlier use for the same ad; quotes; saves the snapshot on the ad (also in `price_paise_at_order` / `days_at_order`, so older code keeps working); saves or updates ONE waiting (`created`) payment; writes the redemption; if the total is 0 the payment becomes `paid` with method `free_offer` and the ad goes to `paid_pending_review`. A transaction-only switch (`app.order_in_progress`) lets this function change the locked columns; employers cannot set it for anything else because only this function turns it on.
- **Old ads keep their price:** the snapshot is saved at order time; later changes to a plan or an offer never touch it. Approve uses the saved days (bonus days included); Mark as paid fills the waiting payment (no second row) and uses the saved final price.
- **Admin only:** `admin_extend_job(job, days, reason)` (live or hidden ads, reason needed), `admin_set_featured(job, on/off)`, `admin_give_free_ad(job, note)` (payment of 0, method `complimentary`). All write to `admin_log`.

## Online payments (migration 0023)
- `payments.razorpay_order_id` and `razorpay_payment_id` are unique. `razorpay_events` (one row per webhook event) has Row Level Security: only admins can read; nobody writes except the server.
- `mark_job_paid` is the one place an ad becomes paid. It and `razorpay_order_info`, `razorpay_attach_order`, `razorpay_capture`, `razorpay_refund` are closed to anon and logged-in users (only the service role used by the Edge Functions can run them). `razorpay_capture` refuses an unknown order, a different amount and an ad that is no longer waiting, and ignores a repeated event.
- Tests: `scripts/rls.razorpay.test.mjs`.

## QR picture and payment proof (migration 0024)
- Two new storage buckets. `shop-assets` is public to read and only admins can write or delete (1 MB, pictures only); the QR picture is the setting `qr_path`, readable by logged-in people only, saved only by `admin_save_settings`, and only if the file really exists in `shop-assets`. `payment-proofs` is private: an employer writes in their own folder and reads their own files, admins read all (3 MB, pictures and PDF).
- Table `payment_proofs` (one per ad, RLS: owner or admin can read, nobody writes directly). `submit_payment_proof` checks: own ad, ad waiting for payment, not blocked, a reference of 6 to 30 letters and numbers, a reference not used by any payment or any other live proof, and a file that exists in the employer's own folder. `admin_reject_proof` needs a reason. `admin_mark_paid` marks the open proof accepted. Nothing marks an ad paid except the admin (or the verified Razorpay webhook).
- Tests: `scripts/rls.proof.test.mjs`; browser tests: `e2e/proof.spec.js`.

## Functions
- `public_counts()` (visitors may call it): three numbers for the home page: live ads, verified employers, applications. Nothing else (0020).
- `is_admin()` (also checks the two-step login), `is_blocked()` - helpers for the rules.
- `admin_*` functions above; `job_accepts_applications(job)` (used by the apply rule); `employer_may_see_applicants()`, `count_my_applications()`.
- `expire_jobs()` - sets `expired` on live ads past their end time. `cleanup_old_data()` - daily: deletes applications older than 180 days, error lines older than 30 days, and ads still waiting for payment after 30 days (their waiting payment and offer use go with them; their files stay until Admin > Problems > unused files removes them) (0019).
- Phase 2 will turn `admin_mark_paid` into a shared `mark_job_paid` used by the webhook too.

## How the rules are tested
`scripts/rls.test.mjs` (59 tests + 10 for change requests), `scripts/rls.hardening.test.mjs` (migrations 0012 and 0014) and `scripts/rls.mfa.test.mjs` (0013) run the **real migrations in a real Postgres engine** (PGlite, inside Node). Only Supabase's own parts are faked: the roles `anon`/`authenticated`, `auth.users`, `auth.uid()`, `auth.jwt()`, `auth.mfa_factors` and the storage tables. Each test acts as a visitor, employer, blocked employer or admin and tries things it should and should not be allowed to do. Run with `npm test`. Whenever a rule was added, it was broken on purpose once to check that a test fails.

Security check list (all automated unless noted):
1. Visitor cannot read non-live ads, the `jobs` table, payments, profiles, applications; cannot write anything; cannot call admin or expiry functions.
2. B cannot read, edit or delete A's ads, payments, applicants or requests.
3. A cannot set `status`, `package_id`, dates, owner, reason or saved price; an insert asking for `live` is stored as "waiting for payment".
4. A cannot insert, change or delete a payment.
5. A cannot make themselves admin, verified or unblocked, or change their email; signup always creates an employer.
6. A cannot upload to B's folder, store more than 100 files, or store a file link that was typed in (any website, even one ending in our path).
7. A blocked employer cannot insert an ad, edit a waiting ad, upload or ask for changes; blocking hides live ads.
8. Visitor can apply to a live ad but not to a hidden, ended or unpaid one; same phone cannot apply twice; an ad stops at 1000 applications.
9. Admin can do everything listed in `01-overview.md`; approve, reject, hide, show and refund check the ad's status; mark-paid works once per ad and one reference once; every admin action is logged.
10. Expiry and clean-up functions only touch what they should.
11. An admin with the authenticator app on cannot act without the code.
12. An unverified employer cannot read applicants' names or phones.
15. Site settings (`scripts/rls.settings.test.mjs`, 6 tests): the admin saves and changes are logged with old and new value; wrong values refused; employers and visitors cannot save or write the table; a visitor reads only the public settings.
14. Job facts, reports, deletion requests, counters (`scripts/rls.trust.test.mjs`, 14 tests): wrong salary order, currency, experience, vacancies refused; an employer sets the facts only on their own waiting ad; the registration number is public only for a verified employer and an employer cannot verify themselves; a visitor can report only a live ad, once, with a valid reason, 10 an hour; reports and deletion requests are unreadable for visitors and employers; deletion requests are cleaned and limited; the counters give three numbers and ignore blocked employers.
13. Offers and prices (`scripts/rls.offers.test.mjs`, 35 tests): percent, flat, bonus days and free offers; expired, not started, switched off, used-up, already-used, wrong-plan and wrong-employer codes; the per-employer and total limits; a price never below 0; one automatic offer only; an unpaid ad deleted gives the use back; a free total is paid at once; employers cannot change plans, offers, saved prices, payments or redemptions, cannot see other offers' codes, other employers' redemptions or the audit log; old ads keep their price after a plan or offer change; plan delete rule; audit log content; extend, featured and free-ad functions are admin only.

**Not covered by these tests (needs the real project, once):** Supabase's own services: Auth (email confirmation, password rules, CAPTCHA, the real MFA tables), Storage's enforcement of the bucket's file type and size limits, pg_cron actually running, and that the keys in `.env` are right. `06-deploy.md` and the hand checklist in `07-testing.md` cover these.

## Known limits
- The Apply form has duplicate and per-address flood limits but no CAPTCHA (that needs an Edge Function; Cloudflare Turnstile is built in for signup only). Someone with many addresses can still invent phone numbers below the limits.
- Phone numbers typed by applicants are not verified (anyone can enter another person's number).
- Ad files are public by link: employers must not upload personal documents. Uploads are checked by declared type, not by content; the admin looks at every ad before it goes live.
- Admin-created ads and admin edits are trusted: the file-link rule does not apply to admins.
- Unpaid ads older than 30 days and their files are not deleted automatically (the 20-ad limit bounds it).
