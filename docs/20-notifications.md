# 20 - Emails to employers (notifications)

Employers get a short email (English, then Hindi) when something happens to their account or ads. It is **off until you add an email key**: the database already queues the messages, and nothing is sent until the sender function is deployed with the key.

## What is sent
| When | Message |
|---|---|
| The admin verifies the employer | Your job posting request is approved: you can now post different jobs |
| The admin rejects the license | We could not accept your license, with the reason |
| The admin approves an ad | Your ad is live for N days, until a date, with the link |
| The admin rejects an ad | We could not approve it, with the reason and where to fix it |
| The admin adds days (also to an ended ad) | N days added, live until a date |
| An ad ends within 3 days | Your ad ends soon: ask for more days (sent once; sent again after days are added) |
| An ad ends | Your ad has ended: ask for more days or renew |

Each email is a styled page (header bar, the message in English and Hindi each with a button, footer with Contact and My details links; code in `supabase/functions/_shared/emailHtml.js`) plus a plain-text copy. No pictures and no tracking. Whatever an employer typed (a title, a reason) is cleaned: no line breaks in the subject, no control characters, cut to a safe length, and escaped in the page so it can never become HTML or a link; only links that start with our own https address are used. Each email ends with how to turn the emails off. An employer turns them off in **My details**; blocked employers get none; a failed message is tried up to 5 times; messages older than 60 days are deleted.

The admin's **Tell the employer on WhatsApp** button is separate and stays: use it when you want to write personally.

## How it works
1. The database writes a row in `notifications` for each event above (`queue_notification`, called by the approve, reject, extend, license and expiry functions). A daily job queues the "ends soon" messages (`queue_ending_reminders`) and deletes old ones (`purge_old_notifications`); if `pg_cron` is not turned on, run those two by hand now and then (Supabase > SQL Editor: `select public.queue_ending_reminders();`), or turn on `pg_cron` (Dashboard > Database > Extensions) and run the last block of migration 0034 again.
2. The Edge Function `send-notifications` (folder `supabase/functions`) takes the due messages (`claim_notifications`), sends each by the email service, and marks it sent or failed. It does nothing at all if the key is missing.
3. Supabase Cron calls the function every 5 minutes.

## Set-up (once; you need an email service)
The code is written for **Resend** (resend.com). Another service needs a small change in `supabase/functions/_shared/notify.js`.
1. Make a Resend account and **verify your domain** (for example `deshduniya.com`): Resend shows DNS records to add in Cloudflare. A sender address on a domain that is not verified is refused.
2. Create an API key in Resend (sending access only).
3. Choose a long random text as the shared secret (for example 40 random letters and numbers). Anyone with it can ask the function to send the queued mails (it can only send what is already queued).
4. Set the secrets (never in the repository; the CLI must be logged in and linked):
   ```
   npx supabase secrets set NOTIFY_SECRET=... RESEND_API_KEY=re_... NOTIFY_FROM="Jobs Abroad <hello@deshduniya.com>" SITE_URL=https://deshduniya.com
   ```
5. Deploy: `npx supabase functions deploy send-notifications --no-verify-jwt` (the shared secret is the proof, not a Supabase login).
6. Cron: Supabase dashboard > Integrations > Cron > New job: every 5 minutes, type "Supabase Edge Function" (or HTTP request) to `https://<project>.supabase.co/functions/v1/send-notifications`, method POST, header `x-notify-secret: <the secret>`.
7. Test: approve a test ad for a test employer who has an email you can read. Within about 5 minutes the email arrives. If it does not: Supabase > Table Editor > `notifications` shows `last_error` and `attempts` for each message, and Edge Functions > send-notifications > Logs shows the answer.

## If you do not want emails
Do nothing: the queue fills quietly and old messages are deleted after 60 days. Or deploy nothing and skip steps 1 to 6.

## Tests
`scripts/rls.notifications.test.mjs` (which event queues what, blocked and opted-out employers, retries, who may call what), `scripts/notify.test.mjs` (the texts, cleaning, the sender with a fake email service, the secret), and a browser test for the choice in My details. Not tested against the real Resend: do step 7 once.
