# 19 - Go-live runbook: put the new version on the real site

For the step that takes the work from the branch `feat/razorpay-and-fixes` to the live site (Cloudflare Pages + the Supabase project JobPortal-Mumbai). Do the steps in order. Nothing here is done automatically.

## What changes for the live site
- **Database** (migrations 0027 to 0034): only verified employers can post; verifying needs a license; ads are free and wait for approval; the admin chooses the days; ended ads can get More days; a public Verified agencies list. All three are additive (new tables, triggers, functions, a view, two private storage buckets). They change how posting works, so **the new website code and the new database must go live together**: the OLD website code cannot post an ad once 0028 is applied.
- **Website**: license form, free posting, approve with days, work queue, share button, Verified agencies and How to check an agency pages, the WhatsApp "tell the employer" button. The employer payment screens are gone.

## State of the live project when this runbook was written (checked read-only)
- 0 employers, 0 applications, 0 live ads, 1 older test ad waiting for payment and 1 payment record. So no real user can be hurt by the short gap between the database change and the website change. The older test ad keeps working through the admin's old payment tools.
- Migrations 0001 to 0026 are applied (so the empty QR/proof table and buckets from 0024 exist; 0030 removes them). None of the new triggers, the license table or the agencies view exist yet.

## Before you start (repeat if the code changed)
1. `npm run test:all` passes (all required steps). The live database test comes after the migrations (step 1 below).
2. The Cloudflare variables are unchanged: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (production). Nothing new is needed.
3. Optional backup: with only one test ad and one payment there is little to lose. If you want one anyway, in the Supabase dashboard open Database > Backups, or run `npx supabase db dump --linked -f backup.sql` (needs Docker).

## Steps
1. **Apply the eight migrations, in order, to the linked project** (the CLI is logged in and linked; if not: `npx.cmd supabase login`, then `npx.cmd supabase link --project-ref nvjoiomubxtqnnlmfzkb`):
   ```
   npx supabase db query --linked -f supabase/migrations/0027_verified_to_post.sql
   npx supabase db query --linked -f supabase/migrations/0028_license_and_free_posting.sql
   npx supabase db query --linked -f supabase/migrations/0029_verified_agencies.sql
   npx supabase db query --linked -f supabase/migrations/0030_remove_qr_and_payment_proof.sql
   npx supabase db query --linked -f supabase/migrations/0031_edit_while_waiting.sql
   npx supabase db query --linked -f supabase/migrations/0032_file_cleanup_queue.sql
   npx supabase db query --linked -f supabase/migrations/0033_ad_views.sql
   npx supabase db query --linked -f supabase/migrations/0034_notifications.sql
   ```
   Do not use `live-apply.mjs` for 0027 alone: its live test already expects 0028. If 0030 prints a notice that it could not delete the empty buckets `shop-assets` and `payment-proofs`, delete those two empty buckets in Supabase > Storage by hand.
2. **Run the live database test** (it rolls everything back and keeps nothing): `node scripts/live-e2e.mjs`. Expect every check to pass (about 120). If any line fails, stop and do not deploy: tell the developer which line.
3. **Push the branch and open a pull request**: `git push -u origin feat/razorpay-and-fixes`. The CI on GitHub runs lint, unit tests, build, audit and the browser tests: wait for it to be green. (The weekly backup job fails until its two secrets are added; that is separate.)
4. **Merge the pull request into `main`.** Cloudflare Pages builds and publishes `main` by itself (a few minutes). Watch it in the Cloudflare dashboard: Workers & Pages > your project > Deployments.
5. **Publish the guides** so Admin > Guides shows the new text: `npm run guides:publish`.
6. **Smoke test the live site** (read-only): `npm run smoke:live -- https://deshduniya.com`.
7. **Hand check on the live site** with a test employer account (the list is in `11-owner-checklist.md`, "License and posting hand check"): send a license, reject it once, verify, post an ad, approve with 2 days, see it on the site, end it, use More days. Open `/agencies` and `/check-agency`. Tap Share on an ad on a phone.
8. **Then**: remove the test employer if you made one (Supabase > Authentication), and tell the first real agencies to sign up.

## If something goes wrong
- **Website problem after the deploy:** in Cloudflare Pages > Deployments, choose the previous deployment and **Rollback**. But the old website cannot post ads against the new database. If posting must work during a rollback, deploy again after fixing; the database does not need to change back.
- **A migration fails halfway:** Supabase stops at the first error. Read the message, tell the developer, and do not run the next file. Do not edit a migration that already ran; a fix is a new numbered file.
- **Live test fails:** do not deploy. The new database rules only block posting by unverified employers, so the live site (no employers yet) keeps working for visitors.

## After go-live (not part of this step)
- Emails to employers are off until you set them up: `20-notifications.md` (Resend account, domain, key, deploy the function, cron). Without it the messages just wait in the queue. If `pg_cron` is not turned on, migration 0034 prints a notice: turn on `pg_cron` and run its last block again, or run `select public.queue_ending_reminders();` by hand.
- Add the two GitHub secrets for the weekly backup (`SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`).
- A lawyer reads the terms, privacy, refund and How-to-check pages; a native Hindi reader checks the Hindi.
- Make a second admin with two-step login (Admin > Security).
