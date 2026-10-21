# 06 - Set-up and go-live

A short "what only you can do" list is in `11-owner-checklist.md`. This file explains each step.

## A. Supabase (once)
1. Make a Supabase account and create a project (or move an existing empty one to another region with `node scripts/move-project.mjs <new-ref>`; it needs the new project's database password in `SUPABASE_DB_PASSWORD`). Choose a region near India (Mumbai). Save the database password somewhere safe. **Use the paid (Pro) plan for the real site** (see F).
2. **SQL Editor > New query**: open `supabase/schema.sql`, paste all of it, press **Run**. It creates tables, security rules, functions, the `job-files` storage bucket, 3 placeholder packages, and (when pg_cron is available) the schedule for ad expiry and old-data clean-up. It is the sum of all the numbered migrations (currently 0001 to 0028).
   - If your project already ran some migrations, apply only the newer numbered files with `node scripts/live-apply.mjs supabase/migrations/<file>.sql` (tests first, then the file, then the live test). With the CLI linked, `npx supabase db push --linked` also works because the history is registered. Do not run the whole file twice on a project that has real data.
2b. **One-time storage address.** In the SQL Editor run (with your own project address, the same as `VITE_SUPABASE_URL`, no slash at the end): `insert into public.app_settings (key, value) values ('storage_base', 'https://YOUR-PROJECT-ID.supabase.co') on conflict (key) do update set value = excluded.value;` Without this, employers cannot save ads that have a file.
3. **Storage**: check that a bucket named `job-files` exists and is Public, with a 3 MB limit. (The SQL creates it.)
4. **Authentication > Providers > Email**: **Confirm email must be ON for the real site.** (OFF only for a private first test.) Set the minimum password length to 8.
5. **Authentication > URL configuration**: set Site URL to your real site address, and add `https://YOUR-SITE/reset-password` to the allowed redirect URLs (for "forgot password").
6. **Authentication > SMTP Settings**: connect your own email sender (Resend, Brevo, SES or similar). Supabase's built-in sender allows only a few emails an hour, so signup and reset emails would fail.
7. **Project Settings > API**: copy **Project URL** and the **anon public** key. Never copy or share the *service_role* key.
8. **(Recommended) CAPTCHA for signup**: make a free Cloudflare Turnstile widget. Put the **secret** key in Supabase **Authentication > Attack Protection > CAPTCHA** (provider Turnstile). Put the **site** key in the Cloudflare Pages settings as `VITE_TURNSTILE_SITE_KEY`. The signup screen then shows the check automatically. **The same site key also adds the check to the Apply and Report forms**, but the database only insists on it after you switch it on: see `docs/22-spam-protection.md` for the steps and their order.

## B. Run on your computer
```
copy .env.example .env      (then paste the two values into .env)
npm install
npm run dev
```
With the two values empty the app runs in **demo mode** (fake data in the browser). `npm test` never uses your `.env`.

## C. Make yourself admin, then protect the admin account
1. Sign up once on the site with your own email.
2. SQL Editor, run (with your email): `update public.profiles set role = 'admin' where email = 'you@example.com';`
3. Log in again. The account button now opens **/admin**.
4. **Make a second admin** the same way (a trusted person, or a second email of yours) so you are never locked out.
5. **Turn on two-step login**: Admin > Security > "Turn on two-step login", scan the picture with an authenticator app, type the code. After that every admin login asks for a code. Do this for both admins.

## C2. Try the public site with sample ads (test project only)
1. Open `supabase/sample-ads.sql`, put your email where it says `you@example.com` (twice), paste it in the SQL Editor and Run.
2. Open your site (`npm run dev` with the real `.env`). You should see **3 live ads** with the first one **Featured** and **Verified recruiter**. The ad that "ended yesterday", the hidden ad and the unpaid ad must **not** show.
3. Open an ad, tick the consent box and send the Apply form: you see the green success message. Send it again with the same phone: you see "You already applied...".
4. In Supabase > Table Editor > `applications` you see the row. (Visitors cannot read it; the ad's employer sees it only after being verified.)
5. Remove the samples when done (last lines of the file).

## D. Expire ads and clean up old data automatically (pg_cron)
Migration 0012 tries to switch this on by itself. Check: **Database > Extensions**: `pg_cron` is enabled, and in the SQL Editor `select jobname, schedule from cron.job;` shows `expire-jobs` (every 10 minutes) and `cleanup-old-data` (daily). If not, enable the extension and run:
```
select cron.schedule('expire-jobs', '*/10 * * * *', 'select public.expire_jobs()');
select cron.schedule('cleanup-old-data', '30 3 * * *', 'select public.cleanup_old_data()');
```
The website hides ended ads by itself anyway, so a delay of a few minutes never shows an old ad.

## E. Put the site online (Cloudflare Pages)
Full details and the dashboard checklist: `13-cloudflare-pages.md`.
1. Push the project to GitHub (a **private** repository).
2. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git. Framework preset **None**, build command `npm run build`, output directory `dist`. The Node version (22) comes from the file `.node-version`.
3. **Settings > Variables and Secrets**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (**both required**) and, if you use the CAPTCHA, `VITE_TURNSTILE_SITE_KEY`. Add them for **Production**. For **Preview** use a different (staging) Supabase project, or turn preview deployments off (see `13`). A published site missing the two Supabase values shows a "This site is not ready yet" page (never fake data). Only for a public *demo* site on purpose, add `VITE_ALLOW_DEMO=true` instead.
4. Log in as admin and open **Admin > Settings**: fill in the WhatsApp number, contact email, complaints person and email, company name and site address. No code change and no new build is needed for the site to use them. **Until the UPI ID and its name are filled in, the payment screen shows "payment details are not ready"** (so no money can go to a wrong or example UPI ID). The home page of the admin area shows a red reminder while anything is missing. Search pages and the sitemap use the site address at the next build (or set the hosting variable `SITE_URL`).
5. **Keep share previews and search pages fresh:** Settings > Builds > **Deploy hooks**: create one and call it every 3 hours with a free cron service (for example cron-job.org). New ads then get their own page and picture preview within about 3 hours, and ended ads leave search results. (The free plan allows 500 builds a month; hourly would need 720, so do not go below every 2 hours.)
6. **Custom domain:** Custom domains > Set up a domain. Then put the same address in `SITE_URL`, in Supabase (Authentication > URL configuration: Site URL and the `/reset-password` redirect), and in the Turnstile widget's allowed hostnames.
7. Submit `https://YOUR-SITE/sitemap.xml` in Google Search Console.
8. The security headers and caching rules are written at build time into `dist/_headers` (`scripts/headers.mjs`). If you add a new outside service (for example an analytics counter), add its address there on purpose.

## F. Before real customers
- Use the **paid** Supabase plan: free projects pause after about a week without visits and have no backups.
- **Backups:** the paid plan keeps daily backups. Also switch on the weekly copy: in GitHub add the secrets `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE` (see the top of `.github/workflows/backup.yml`). Write the passphrase down in a safe place.
- Set up an uptime alert (UptimeRobot, free) for your site address AND for `https://YOUR-PROJECT-ID.supabase.co/rest/v1/` (add the anon key header) so you notice if the database is down.
- Ask a native speaker to read the Hindi text. Have Privacy, Terms and the employer rules reviewed by a lawyer (see `11-owner-checklist.md`).
- Run the hand checklist in `07-testing.md` and the security list in `03-database-security.md` on the real project.

## Security headers
Written at build time (see E.7). They allow connections only to your site and your own Supabase project (plus Plausible and Cloudflare Turnstile only when turned on), forbid inline scripts and styles, forbid framing, and force HTTPS.

## Troubleshooting
| Problem | Likely cause |
|---|---|
| The Cloudflare build stops with "config check FAILED" | The two Supabase values are missing in the Cloudflare settings |
| Site shows "This site is not ready yet" | The two `VITE_...` values are missing or mistyped in the Cloudflare settings for that environment (fix them and redeploy) |
| Site shows "Demo mode" online | `VITE_ALLOW_DEMO=true` is set. Remove it and add the two real values |
| "Email or password is not correct" for a new account | "Confirm email" is on and the email link was not tapped |
| No emails arrive | SMTP is not connected (A.6), or the sender is not verified |
| Employer cannot save an ad with a file ("not allowed") | `storage_base` is not set (A.2b), or it does not match the project address |
| Ads do not appear | Ad is not `live`, or its end time has passed, or a wrong Supabase URL/key |
| Upload fails | File is not JPG/PNG/WebP/PDF, over 3 MB, or the SQL was not run (no bucket) |
| Admin area asks for a code you do not have | Two-step login is on and the phone is lost: use the second admin, then remove the factor in Supabase > Authentication > Users |
| Share preview shows an old or generic picture | The build has not run since the ad went live (E.5) |
