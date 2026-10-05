# 06 - Set-up and go-live

## A. Supabase (once)
1. Make a free account at supabase.com and create a project. Choose a region near India (Mumbai). Save the database password somewhere safe.
2. **SQL Editor > New query**: open `supabase/schema.sql`, paste all of it, press **Run**. It creates tables, security rules, functions, the `job-files` storage bucket and 3 placeholder packages. Running it again is mostly safe (it uses "if not exists" and "drop policy if exists").
3. **Storage**: check that a bucket named `job-files` exists and is Public. (The SQL creates it.)
4. **Authentication > Providers > Email**: for a first test, switch **Confirm email** off so signup works at once. Switch it on again before launch if you want verified emails.
5. **Authentication > URL configuration**: set Site URL to your real site address.
6. **Project Settings > API**: copy **Project URL** and the **anon public** key. Never copy or share the *service_role* key.

## B. Run on your computer
```
copy .env.example .env      (then paste the two values into .env)
npm install
npm run dev
```
With the two values empty the app runs in **demo mode** (fake data in the browser).

## C. Make yourself admin
1. Sign up once on the site with your own email.
2. SQL Editor, run (with your email): `update public.profiles set role = 'admin' where email = 'you@example.com';`
3. Log in again. The account button now opens **/admin**.

## C2. Try the public site with sample ads (test project only)
1. Open `supabase/sample-ads.sql`, put your email where it says `you@example.com` (twice), paste it in the SQL Editor and Run.
2. Open your site (`npm run dev` with the real `.env`). You should see **3 live ads** with the first one **Featured** and **Verified recruiter**. The ad that "ended yesterday", the hidden ad and the unpaid ad must **not** show.
3. Open an ad, send the Apply form: you see the green success message. Send it again with the same phone: you see "You already applied...".
4. In Supabase > Table Editor > `applications` you see the row. (Visitors cannot read it, only you as admin and the ad's employer.)
5. Remove the samples when done (last lines of the file).

## D. Expire ads automatically (pg_cron)
1. **Database > Extensions**: search `pg_cron`, enable it.
2. SQL Editor, run once: `select cron.schedule('expire-jobs', '*/10 * * * *', $$select public.expire_jobs()$$);`
The website hides ended ads by itself anyway, so a delay of a few minutes never shows an old ad.

## E. Put the site online (Netlify)
1. Push the project to GitHub.
2. Netlify > Add new site > Import from Git. Build command `npm run build`, publish directory `dist` (already in `netlify.toml`).
3. **Site settings > Environment variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. **Both are required.** A published site that is missing them shows a "This site is not ready yet" page (never fake data). Only if you want a public *demo* site on purpose, add `VITE_ALLOW_DEMO=true` instead.
4. In `src/config.js` set your real `WHATSAPP_NUMBER`, `UPI_ID`, `CONTACT_EMAIL` and `SITE_URL`; commit and push.
5. Optional but recommended: **Build hooks** - create one and call it once a day (free cron service) so search pages and the sitemap include new ads.
6. Submit `https://YOUR-SITE/sitemap.xml` in Google Search Console.

## F. Before real customers
- Use the **paid** Supabase plan: free projects pause after about a week without visits.
- Set up uptime alerts (UptimeRobot, free) for your site address.
- Set a spending alert / daily backups in Supabase (paid plan).
- Ask a native speaker to read the Hindi text. Have the Privacy and Terms pages reviewed.
- Run the hand checklist in `07-testing.md` and the security list in `03-database-security.md` on the real project.

## Security headers
`netlify.toml` sets a strict Content-Security-Policy and other headers. It allows connections only to your site, `*.supabase.co` and `plausible.io` (optional analytics). Add any new service there on purpose.

## Troubleshooting
| Problem | Likely cause |
|---|---|
| Site shows "This site is not ready yet" | The two `VITE_...` values are missing or mistyped in Netlify (fix them and redeploy) |
| Site shows "Demo mode" online | `VITE_ALLOW_DEMO=true` is set. Remove it and add the two real values |
| "Email or password is not correct" for a new account | "Confirm email" is on and the email link was not tapped |
| Ads do not appear | Ad is not `live`, or its end time has passed, or a wrong Supabase URL/key |
| Upload fails | File is not JPG/PNG/WebP/PDF, over 10 MB, or the SQL was not run (no bucket) |
