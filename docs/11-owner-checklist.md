# 11 - Owner checklist: what only you can do

Everything that could be done in the code has been done (see the status table at the end of `00-project-analysis.md`). These items need your accounts, money or a professional. Tick each one.

## A. Before any real user
- [ ] **Paid Supabase plan** (about Rs 2,100 a month) so the project never pauses and has daily backups.
- [ ] **Run the database files** on the real project, in order, if it was set up earlier: `0010` to `0017` (or the whole `schema.sql` on a brand-new project). Then run the one-time line for `storage_base` (`06-deploy.md`, A.2b).
- [ ] **Supabase settings** (`06-deploy.md` A.4 to A.8): Confirm email ON; minimum password 8; Site URL and the `/reset-password` redirect; **your own email sender (SMTP)**; CAPTCHA with Cloudflare Turnstile (secret in Supabase, site key in Cloudflare).
- [ ] **Fill in `src/config.js`**: WhatsApp number, UPI ID, name on the UPI ID, contact email, complaints person and email, site address. The Cloudflare build refuses to publish until you do.
- [ ] **Cloudflare Pages settings** (`13-cloudflare-pages.md`, section "Set by hand in the dashboard"): project from Git, the Supabase values for Production AND a separate staging project (or preview deployments off) for Preview, custom domain, a deploy hook called every 3 hours.
- [ ] **Admin safety**: make a second admin; turn on two-step login for both (Admin > Security).
- [ ] **Backups**: add the two GitHub secrets for the weekly backup; do one test restore.
- [ ] **Uptime alerts**: UptimeRobot for the site and for the Supabase address.
- [ ] **Hindi**: pay one native Hindi reader (about 2 hours) to read `src/shared/i18n/hi.js` and the legal texts.
- [ ] **Real-project hand check**: the list in `07-testing.md` (items 1-14 and 13b).

## B. Professionals (this is not legal advice; ask them to confirm)
- [ ] **Lawyer: overseas recruitment.** Which agents must be registered, what you must check and display, fee limits for job seekers, and whether you may advertise for employers without registration. Then tell your developer what the admin checklist and the registration-number rule should say.
- [ ] **Lawyer: personal data.** The consent text on the apply form, the 180-day keeping time, deletion requests, and the privacy page (current texts are drafts: "not legal advice").
- [ ] **Lawyer: employer terms and refund rule** (the draft says: full refund if we reject, none after the ad has run). **Intermediary rules**: whether you must publish a grievance officer and take-down times.
- [ ] **Accountant**: GST registration and invoices for what you charge employers; how to record manual UPI payments; refunds.
- [ ] **Named complaints person** (`GRIEVANCE_NAME`, `GRIEVANCE_EMAIL`): someone who really answers within 2 days.

## C. Your business decisions (the code follows my recommended defaults; tell me to change any)
- [ ] Applicants' phone numbers only for verified employers (default ON). To switch off: `app_settings` row `applicants_need_verified` = `false`.
- [ ] Verify every new employer's first ad by phone (admin habit; the site shows a hint).
- [ ] Rejected ad: free fix and send again; refund if still rejected.
- [ ] Paid ads cannot be edited; employers use "Ask us to change this".
- [ ] Hindi when the phone is set to Hindi.
- [ ] Prices are shown publicly on the Post-a-job page.
- [ ] Ask Razorpay now whether overseas-job advertising is allowed (Phase 2).
- [ ] Optional: a "send us your ad on WhatsApp, we post it" service at a higher price (not built).

## D. Optional extras that need an outside account
- [ ] Error reports: a free Sentry account (needs a small code change and a line in `scripts/headers.mjs`). Today the site only logs errors in the browser.
- [ ] A staging Supabase project (free) to try database changes before the real one.
- [ ] Cloudflare Turnstile + an Edge Function for the apply form (stops fake applications; needs a developer).
