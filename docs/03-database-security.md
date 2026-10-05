# 03 - Database and security

Source of truth: the numbered files in `supabase/migrations`. `supabase/schema.sql` is generated from them (`npm run schema`); a test fails if it is out of date. Never edit a migration that has already been run on a real project: add a new one.

## Tables
| Table | Holds | Notes |
|---|---|---|
| `profiles` | one row per login: role (`admin`/`recruiter`), company, phone, `verified`, `blocked` | created by a trigger at signup, always as `recruiter` |
| `packages` | name, `price_paise`, `duration_days`, `featured`, `active` | prices are public; 3 placeholder packages in `seed.sql` |
| `jobs` | the ads: owner, package, title, company, country, city, category, file link/path/type, WhatsApp, dates, `status`, `reject_reason` | country and category limited by CHECKs |
| `payments` | amount (paise), method (`manual`/`razorpay`), status (`created`/`paid`/`refunded`), note | Phase 1 only admin writes, method `manual` |
| `applications` | candidate name, phone, city, message | no login to insert; one per ad per phone (last 10 digits), at most 1000 per ad (migration 0008) |
| view `public_jobs` | live, not-ended ads + `featured` + `recruiter_verified` | what the website reads; hides owner ids |

## Who can do what (Row Level Security)
| | Visitor | Recruiter | Admin |
|---|---|---|---|
| Read ads | only `live` and not ended (view / policy) | + their own ads | all |
| Create ad | no | yes, forced to `pending_payment`, active package required, not blocked | yes |
| Change ad | no | own ad only while `pending_payment`; **cannot change** `status`, `package_id`, `starts_at`, `expires_at`, `recruiter_id`, `reject_reason`, `posted_date` (trigger) | yes |
| Delete ad | no | own ads | any |
| Payments | no | read own; **cannot write** | read and write all |
| Applications | insert only for a live ad | read for own ads | all |
| Packages | read | read | write |
| Profiles | no | read/edit own company and phone only (trigger blocks role, verified, blocked, email) | all |
| Files | read by link | upload/delete only inside `<own user id>/` | all |

## Extra locks (found by self-review)
- `file_url` must be `https`, must point to **our** storage and match `file_path` (stops outside pictures, tracking links, phishing links). Checked by trigger on insert and update.
- `file_path` must start with the user's own id (so nobody can point at, or delete, another user's file).
- Storage bucket `job-files`: public read by link, 10 MB limit, only JPG/PNG/WebP/PDF, no folder listing for others.
- `expire_jobs()` cannot be called from a browser. `admin_approve_job` and `admin_mark_paid` check `is_admin()` themselves.
- Blocked employers cannot insert ads, edit waiting ads, or upload files.
- **Abuse limits (migrations 0008 and 0009):** at most 20 ads waiting for payment per employer; at most 200 files per employer; at most 1000 applications per ad; one application per ad per phone (last 10 digits); company name max 120 and phone max 20 characters.
- `admin_mark_paid` locks the ad row while it works, so two admins pressing at once cannot record two payments.
- The public view `public_jobs` is read-only for everyone (and hides owner ids and internal fields).
- A trigger corrects what an employer sends when creating an ad (status, owner, dates), so nothing dangerous can ever be stored, whatever the browser asks for.

## Functions
- `is_admin()`, `is_blocked()` - helpers for the rules.
- `admin_approve_job(job)` - live now, for the package's days (30 if none).
- `admin_mark_paid(job, amount?, note?)` - writes a manual payment and moves the ad to `paid_pending_review`. Phase 2 will turn this into a shared `mark_job_paid` used by the webhook too.
- `expire_jobs()` - sets `expired` on live ads past their end time. Run by pg_cron every 10 minutes (see `06-deploy.md`). The website also hides ended ads by itself.

## How the rules are tested (`scripts/rls.test.mjs`, 59 tests)
The real migrations run in a **real Postgres engine** (PGlite, inside Node). Only Supabase's own parts are faked: the roles `anon`/`authenticated`, `auth.users` + `auth.uid()`, and the storage tables. Each test acts as a visitor, employer, blocked employer or admin and tries things it should and should not be allowed to do. Run with `npm test`.

Security check list (all automated unless noted). Using two employers A and B, a blocked employer and a visitor:
1. Visitor cannot read non-live ads, payments, profiles, applications; cannot write anything; cannot call admin or expiry functions.
2. B cannot read, edit or delete A's ads, payments or applicants.
3. A cannot set `status`, `package_id`, dates, owner or reason; an insert asking for `live` is stored as "waiting for payment".
4. A cannot insert, change or delete a payment.
5. A cannot make themselves admin, verified or unblocked, or change their email; signup always creates an employer.
6. A cannot upload to B's folder, store more than 200 files, or set a file link that is outside our storage or does not match the path.
7. A blocked employer cannot insert an ad, edit a waiting ad, or upload.
8. Visitor can apply to a live ad but not to a hidden, ended or unpaid one; the same phone cannot apply twice; an ad stops at 1000 applications.
9. Admin can do everything listed in `01-overview.md`; mark-paid works once per ad; approve gives the package's days.
10. Expiry function expires only ended live ads.

**Checked that the tests really catch mistakes:** I broke four rules on purpose (employers allowed to write payments, to change the package, anyone allowed to read profiles, no file-link check) and the tests failed each time. The fifth (public view writable) did not fail because a view made from several tables cannot be written to anyway; the extra lock is defence in depth.

**Not covered by these tests (needs the real project, once):** Supabase's own services. That is: the Auth service (email confirmation, password rules), Storage's enforcement of the bucket's file type and size limits, pg_cron actually running, and that the keys in `.env` are the right ones. `06-deploy.md` section C2 and the hand checklist in `07-testing.md` cover these.

## Known limits
- The Apply form has duplicate and flood limits but **no CAPTCHA**: someone can still invent many phone numbers across many ads. If spam appears, add Cloudflare Turnstile checked by a Supabase Edge Function.
- Ad files are public by link: employers must not upload personal documents.
- Applicants' personal data: keep only as long as needed; delete on request (manual for now).
- An employer can delete their own paid ad. The payment record stays (the link to the ad is cleared).
