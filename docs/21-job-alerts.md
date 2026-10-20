# 21 - Job alerts (emails to job seekers)

A job seeker can ask for an email when a new ad matches. It is free, needs no login and can be stopped with one tap. It uses the same email sender as the employer emails (`docs/20-notifications.md`): **no alert is sent until that is set up** (Resend key, `send-notifications` function, 5-minute cron).

## What the job seeker sees
1. On **Jobs** (also the country pages) tap **Get job alerts**. The pop-up shows what the alert is for (the country and kind of work already chosen in the filters, or "all new ads") and asks for an email.
2. We send a **confirm email**. Nothing else is sent until the person taps the button in it. If they did not ask, they ignore it and the email is deleted after 7 days.
3. After confirming, once a day (about 9:30 in the morning in India) they get **one email** listing the new matching ads (up to 8, with the total). Only ads that went live after they confirmed are sent, and each ad only once.
4. Every email ends with **Unsubscribe**. It deletes every alert of that email address at once. The mail also carries a `List-Unsubscribe` header, so mail apps can show their own unsubscribe button.
The emails are in the language the person was using (English or Hindi), plain styled pages with a plain-text copy.

## Rules that protect people
- **Confirm first** (double opt-in): nobody can sign up someone else's address and get them spammed. A repeat sign-up for an unconfirmed alert sends the confirm mail at most once an hour.
- At most **5 alerts per email** and **300 new alerts an hour** in total.
- The sign-up answer looks the same whether or not the alert already existed.
- The tables cannot be read or written from the website. Only the three functions (`subscribe_job_alert`, `confirm_job_alert`, `unsubscribe_job_alert`) can be called by visitors. The secret token in the links is a random UUID.
- The privacy page says what we keep and for how long. Alert emails are never shown to employers or admins' screens (there is no screen for them).

## How it works
1. `subscribe_job_alert` saves the alert and queues a confirm mail in `alert_outbox`.
2. `queue_alert_digests` runs daily (pg_cron, 04:00 UTC): for each confirmed alert it finds live ads that started since the alert was last checked, and queues one digest.
3. The Edge Function `send-notifications` (the same one as for employers, deployed again) sends the due alert mails (`claim_alert_mail`), and marks each sent or failed (5 tries).
4. `purge_job_alerts` runs daily and deletes unconfirmed alerts older than 7 days and messages older than 30 days.
If `pg_cron` is not on, migration 0035 prints a notice: run `select public.queue_alert_digests();` once a day and `select public.purge_job_alerts();` now and then by hand.

## Putting it live
1. Apply migration `0035_job_alerts.sql` to the real project (`npx supabase db query --linked -f supabase/migrations/0035_job_alerts.sql`).
2. Redeploy the function: `npx supabase functions deploy send-notifications --no-verify-jwt`.
3. Merge the website change (Cloudflare publishes it).
4. Test with your own email: on the live site tap Get job alerts, confirm, then run `select public.queue_alert_digests();` after approving a matching ad, and see the mail arrive within 5 minutes. A problem shows in Table Editor > `alert_outbox` (`last_error`, `attempts`).

## Tests
`scripts/rls.alerts.test.mjs` (limits, confirm, digest rules, sender rules, unsubscribe, clean-up, who may call what; each rule was broken on purpose once to see a test fail), `scripts/alertmail.test.mjs` (the texts in both languages, escaping, the sender with a fake email service, the secret), `src/shared/data/demo/demo.alerts.test.js`, `e2e/alerts.spec.js` (sign-up, confirm and unsubscribe pages, Hindi). Not tested against the real Resend: do step 4 once.
